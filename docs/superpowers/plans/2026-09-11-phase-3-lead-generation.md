# Phase 3: Lead Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/leads/new` create real, asynchronous, idempotent, org-scoped lead-generation jobs — discover businesses via a mock (but swappable) provider, normalize, deduplicate against existing leads, and persist qualified ones as `leads` rows — with visible polling progress and safe retry.

**Architecture:** A server action inserts a `generation_jobs` row and fires an Inngest event; one Inngest function (running with a service-role Supabase client, since it has no user session) does discovery → normalize → dedupe → filter-gate → lead creation, with every step resumable from `generation_results` row state so retries never duplicate leads. The client polls `generation_jobs` for progress through the normal RLS-protected browser client.

**Tech Stack:** Next.js App Router + Server Actions, Supabase (Postgres, RLS, `@supabase/supabase-js`), Inngest v4 (`inngest`, `inngest/next`), Zod.

**Spec:**
- `docs/wibsity-sales-build-spec.md` §8, §9, §19, §23, §24, §27, §30, §35, §37
- `docs/superpowers/specs/2026-09-11-phase-3-lead-generation-design.md` (as amended)

## Global Constraints

- Scope stops at lead-record creation. No website fetch/analysis, no deterministic scoring, no AI qualification, no real Google Places integration — those are Phase 4/6. `leads.score`/`score_category` stay `null` for leads this phase creates.
- Only one new npm dependency: `inngest` (already installed in `node_modules` and added to `package.json`/`package-lock.json` as of this plan — no `npm install` needed, just commit those two files with the task that first uses it).
- Follow existing codebase conventions exactly, do not introduce new ones:
  - `lib/crm/*.ts`-style functions: `async function name(supabase: SupabaseClient, ...ids, ...args)`, snake_case fields matching DB columns exactly, no framework-level error wrapping unless noted otherwise below.
  - Forms are plain `<form action={serverAction}>` + native `FormData` (see `components/leads/lead-notes.tsx`, `components/leads/lead-filters.tsx`). This codebase has `react-hook-form`/`@hookform/resolvers` installed but **unused anywhere** — do not introduce them for this feature; follow the native-form pattern that's actually used everywhere else.
  - Self-checks are plain `assert`-based `*.test.ts` files run via `npx tsx <path>` (see `lib/crm/followups.test.ts`) — no test framework. Only pure/logic functions get one; DB-touching helpers don't (matches `lib/crm/leads.ts`, `lib/crm/pipeline.ts`, which have no tests).
  - Page components fetch `organization_id` via `supabase.auth.getUser()` then `.from("users").select("organization_id").eq("id", user.id).single()` (see `app/(dashboard)/leads/page.tsx`).
- RLS already fully covers `generation_jobs` and `generation_results` (`db/migrations/0002_rls_policies.sql`) — do **not** add or modify RLS policies for them. The new `lead_id` column and the two new `generation_jobs` filter columns inherit the existing policies automatically.
- The Inngest function runs outside any user session and must use a service-role client (`db/migrations/0003_grants.sql` already grants `service_role` full table access in anticipation of this). That client bypasses RLS entirely, so **every query the Inngest function's code path issues must explicitly filter/set `organization_id`** — there is no RLS safety net there. This is not optional or stylistic; it is the org-isolation guarantee for this feature.
- Idempotency/resumability rule: `generation_results` rows start `pending` and move to exactly one of `created`/`filtered`/`duplicate`, never back. Every counter on `generation_jobs` is **recomputed by aggregate count**, never incremented — this is what makes retries and resumed runs safe.
- Database migrations in this project are applied manually via the Supabase SQL Editor (no migration runner) — `README.md` lists them in order; add new ones to that list.
- Verified after every task: `npm run build` and `npm run lint` both pass clean; any self-check test in that task passes via `npx tsx`.

---

### Task 1: Migration — generation job filters + result lead linkage

**Files:**
- Create: `db/migrations/0004_generation_job_filters_and_result_lead_id.sql`
- Modify: `README.md` (migration list)

**Interfaces:**
- Produces: `generation_jobs.min_rating` (numeric, nullable), `generation_jobs.website_required` (boolean, not null default false), `generation_jobs.phone_required` (boolean, not null default false), `generation_results.lead_id` (uuid, nullable, FK to `leads.id`) — every later task in this plan reads/writes these columns.

- [ ] **Step 1: Write the migration**

```sql
-- wibsity sales: Phase 3 lead generation additions.
-- Generation jobs need to persist their filter inputs so a resumed/retried
-- run (which only receives a job id, not the original form submission) can
-- still apply the same qualify gate. generation_results needs a lead_id so
-- a resumed run can tell which rows already produced a lead without
-- re-deriving it, and so duplicate rows can be traced to the lead they
-- matched. No RLS changes needed: both tables' existing org_isolation
-- policies (db/migrations/0002_rls_policies.sql) already cover new columns.

alter table generation_jobs
  add column min_rating numeric,
  add column website_required boolean not null default false,
  add column phone_required boolean not null default false;

alter table generation_results
  add column lead_id uuid references leads (id) on delete set null;

create index generation_results_lead_id_idx on generation_results (lead_id);
```

- [ ] **Step 2: Run the migration**

Run `db/migrations/0004_generation_job_filters_and_result_lead_id.sql` in the Supabase SQL Editor against the project's database (this repo has no automated migration runner — see `README.md` step 3).

Expected: no errors; `generation_jobs` and `generation_results` show the new columns in the Supabase Table Editor.

- [ ] **Step 3: Update README's migration list**

In `README.md`, in the "Run the database migrations" list (after the `0003_grants.sql` bullet), add:

```markdown
   - `db/migrations/0004_generation_job_filters_and_result_lead_id.sql`: Phase 3
     lead-generation job filters and result-to-lead linkage
```

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0004_generation_job_filters_and_result_lead_id.sql README.md
git commit -m "Add generation job filter columns and result lead linkage"
```

---

### Task 2: Types, form/provider schemas, and pure pipeline utilities

**Files:**
- Create: `types/generation.ts`
- Create: `lib/lead-gen/schemas.ts`
- Create: `lib/lead-gen/normalize.ts`
- Create: `lib/lead-gen/normalize.test.ts`
- Create: `lib/lead-gen/qualify.ts`
- Create: `lib/lead-gen/qualify.test.ts`

**Interfaces:**
- Produces: `GenerationJobStatus`, `GenerationResultStatus`, `GenerationJob`, `GenerationResult`, `GenerationJobCounters`, `RawBusiness` (all `types/generation.ts`); `generationFormSchema`, `GenerationFormInput`, `rawBusinessSchema` (`lib/lead-gen/schemas.ts`); `normalizeDomain(website: string | null): string | null`, `normalizePhone(phone: string | null): string | null`, `normalizeName(name: string): string` (`lib/lead-gen/normalize.ts`); `QualifyFilters`, `passesFilters(business: RawBusiness, filters: QualifyFilters): boolean` (`lib/lead-gen/qualify.ts`). All of these are used by every later task.

- [ ] **Step 1: Create `types/generation.ts`**

```ts
export type GenerationJobStatus = "pending" | "processing" | "completed" | "failed";
export type GenerationResultStatus = "pending" | "created" | "filtered" | "duplicate";

export interface GenerationJob {
  id: string;
  organization_id: string;
  industry: string;
  location: string;
  requested_count: number;
  min_rating: number | null;
  website_required: boolean;
  phone_required: boolean;
  status: GenerationJobStatus;
  progress: number;
  found_count: number;
  analyzed_count: number;
  qualified_count: number;
  duplicate_count: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface RawBusiness {
  external_id: string | null;
  name: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  industry: string;
  city: string | null;
  state: string | null;
  country: string;
  rating: number | null;
  review_count: number | null;
  source_url: string | null;
}

export interface GenerationResult {
  id: string;
  generation_job_id: string;
  external_id: string | null;
  business_name: string;
  raw_data: RawBusiness;
  status: GenerationResultStatus;
  lead_id: string | null;
  created_at: string;
}

export interface GenerationJobCounters {
  found_count: number;
  analyzed_count: number;
  qualified_count: number;
  duplicate_count: number;
  progress: number;
}
```

- [ ] **Step 2: Create `lib/lead-gen/schemas.ts`**

```ts
import { z } from "zod";

export const generationFormSchema = z.object({
  industry: z.string().trim().min(1, "Industry is required"),
  location: z.string().trim().min(1, "Location is required"),
  requestedCount: z.coerce
    .number()
    .int("Must be a whole number")
    .min(1, "Must generate at least 1 lead")
    .max(100, "Max 100 leads per job"),
  minRating: z.coerce.number().min(0, "Must be at least 0").max(5, "Must be at most 5").optional(),
  websiteRequired: z.coerce.boolean(),
  phoneRequired: z.coerce.boolean(),
});

export type GenerationFormInput = z.infer<typeof generationFormSchema>;

export const rawBusinessSchema = z.object({
  external_id: z.string().nullable(),
  name: z.string().min(1),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  industry: z.string(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string(),
  rating: z.number().nullable(),
  review_count: z.number().nullable(),
  source_url: z.string().nullable(),
});
```

- [ ] **Step 3: Create `lib/lead-gen/normalize.ts`**

```ts
export function normalizeDomain(website: string | null): string | null {
  if (!website) return null;
  const stripped = website
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");
  const domain = stripped.split("/")[0];
  return domain || null;
}

export function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, "");
  return digits || null;
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
```

- [ ] **Step 4: Create the self-check `lib/lead-gen/normalize.test.ts`**

```ts
import assert from "node:assert";
import { normalizeDomain, normalizeName, normalizePhone } from "./normalize";

assert.strictEqual(normalizeDomain("https://www.Example.com/"), "example.com");
assert.strictEqual(normalizeDomain("http://example.com/path"), "example.com");
assert.strictEqual(normalizeDomain("Example.COM"), "example.com");
assert.strictEqual(normalizeDomain(null), null);
assert.strictEqual(normalizeDomain(""), null);

assert.strictEqual(normalizePhone("+91 (990) 123-4567"), "919901234567");
assert.strictEqual(normalizePhone(null), null);

assert.strictEqual(normalizeName("  Sun   Solar   Co  "), "Sun Solar Co");

console.log("lib/lead-gen/normalize.test.ts: all checks passed");
```

- [ ] **Step 5: Run the self-check**

Run: `npx tsx lib/lead-gen/normalize.test.ts`
Expected: prints `lib/lead-gen/normalize.test.ts: all checks passed` and exits 0.

- [ ] **Step 6: Create `lib/lead-gen/qualify.ts`**

```ts
import type { RawBusiness } from "@/types/generation";

export interface QualifyFilters {
  minRating: number | null;
  websiteRequired: boolean;
  phoneRequired: boolean;
}

export function passesFilters(business: RawBusiness, filters: QualifyFilters): boolean {
  if (filters.minRating != null && (business.rating == null || business.rating < filters.minRating)) {
    return false;
  }
  if (filters.websiteRequired && !business.website) return false;
  if (filters.phoneRequired && !business.phone) return false;
  return true;
}
```

- [ ] **Step 7: Create the self-check `lib/lead-gen/qualify.test.ts`**

```ts
import assert from "node:assert";
import { passesFilters } from "./qualify";
import type { RawBusiness } from "@/types/generation";

function business(overrides: Partial<RawBusiness> = {}): RawBusiness {
  return {
    external_id: "1",
    name: "Test Co",
    website: "https://test.co",
    phone: "9990001111",
    email: null,
    industry: "Solar",
    city: "Noida",
    state: null,
    country: "India",
    rating: 4.2,
    review_count: 10,
    source_url: null,
    ...overrides,
  };
}

assert.strictEqual(
  passesFilters(business(), { minRating: null, websiteRequired: false, phoneRequired: false }),
  true,
);
assert.strictEqual(
  passesFilters(business({ rating: 3 }), { minRating: 3.5, websiteRequired: false, phoneRequired: false }),
  false,
);
assert.strictEqual(
  passesFilters(business({ rating: null }), { minRating: 3, websiteRequired: false, phoneRequired: false }),
  false,
);
assert.strictEqual(
  passesFilters(business({ website: null }), { minRating: null, websiteRequired: true, phoneRequired: false }),
  false,
);
assert.strictEqual(
  passesFilters(business({ phone: null }), { minRating: null, websiteRequired: false, phoneRequired: true }),
  false,
);

console.log("lib/lead-gen/qualify.test.ts: all checks passed");
```

- [ ] **Step 8: Run the self-check**

Run: `npx tsx lib/lead-gen/qualify.test.ts`
Expected: prints `lib/lead-gen/qualify.test.ts: all checks passed` and exits 0.

- [ ] **Step 9: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 10: Commit**

```bash
git add types/generation.ts lib/lead-gen/schemas.ts lib/lead-gen/normalize.ts lib/lead-gen/normalize.test.ts lib/lead-gen/qualify.ts lib/lead-gen/qualify.test.ts
git commit -m "Add generation types, schemas, and normalize/qualify pipeline utilities"
```

---

### Task 3: Business-search provider abstraction (mock only)

**Files:**
- Create: `providers/business-search/index.ts`
- Create: `providers/business-search/mock.ts`
- Create: `providers/business-search/mock.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `RawBusiness` (`types/generation.ts`, Task 2)
- Produces: `BusinessSearchParams`, `BusinessSearchProvider` interface, `getBusinessSearchProvider(): BusinessSearchProvider` (`providers/business-search/index.ts`) — consumed by the Inngest function in Task 7.

- [ ] **Step 1: Create `providers/business-search/index.ts`**

```ts
import type { RawBusiness } from "@/types/generation";
import { mockBusinessSearchProvider } from "./mock";

export interface BusinessSearchParams {
  industry: string;
  location: string;
  count: number;
}

// RawBusiness's shape mirrors what Google Places' Place Details API returns
// (external_id ~ Place ID, phone ~ formatted_phone_number, review_count ~
// user_ratings_total) so a future google-places.ts implementation is a
// drop-in, not a redesign. Only the mock is implemented in this phase.
export interface BusinessSearchProvider {
  search(params: BusinessSearchParams): Promise<RawBusiness[]>;
}

export function getBusinessSearchProvider(): BusinessSearchProvider {
  const providerName = process.env.BUSINESS_SEARCH_PROVIDER ?? "mock";
  if (providerName === "mock") return mockBusinessSearchProvider;
  throw new Error(
    `Business search provider "${providerName}" is not implemented yet. Only "mock" is available.`,
  );
}
```

- [ ] **Step 2: Create `providers/business-search/mock.ts`**

```ts
import type { BusinessSearchProvider } from "./index";
import type { RawBusiness } from "@/types/generation";

// Dev/test-only stand-in for a real business-search provider (e.g. Google
// Places). Generates plausible-looking businesses with realistic gaps
// (missing phone/website, varying rating) so the form's filters and the
// dedup/qualify pipeline have real work to do. Never treat this as a
// production data source.

const NAME_PREFIXES = ["Sun", "Green", "Prime", "Metro", "Star", "Elite", "Bright", "Urban", "Peak", "Royal"];
const NAME_SUFFIXES = [
  "Solutions",
  "Traders",
  "Enterprises",
  "Works",
  "Group",
  "Co",
  "Services",
  "Hub",
  "Industries",
  "Ventures",
];

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomBusinessName(industry: string): string {
  return `${randomFrom(NAME_PREFIXES)} ${industry} ${randomFrom(NAME_SUFFIXES)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const mockBusinessSearchProvider: BusinessSearchProvider = {
  async search({ industry, location, count }) {
    const results: RawBusiness[] = [];

    for (let i = 0; i < count; i++) {
      const name = randomBusinessName(industry);
      const slug = slugify(name);
      const hasWebsite = Math.random() > 0.2;
      const hasPhone = Math.random() > 0.15;
      const phoneDigits = Math.floor(6000000000 + Math.random() * 3999999999);

      results.push({
        external_id: `mock-${slug}-${slugify(location)}-${i}`,
        name,
        website: hasWebsite ? `https://${slug}.example.com` : null,
        phone: hasPhone ? `+91 ${phoneDigits}` : null,
        email: null,
        industry,
        city: location,
        state: null,
        country: "India",
        rating: Math.round((2.5 + Math.random() * 2.5) * 10) / 10,
        review_count: Math.floor(Math.random() * 300),
        source_url: null,
      });
    }

    return results;
  },
};
```

- [ ] **Step 3: Create the self-check `providers/business-search/mock.test.ts`**

```ts
import assert from "node:assert";
import { mockBusinessSearchProvider } from "./mock";

const results = await mockBusinessSearchProvider.search({
  industry: "Solar companies",
  location: "Noida",
  count: 25,
});

assert.strictEqual(results.length, 25);
for (const business of results) {
  assert.strictEqual(typeof business.name, "string");
  assert.ok(business.name.length > 0);
  assert.strictEqual(business.industry, "Solar companies");
  assert.strictEqual(business.city, "Noida");
  assert.strictEqual(business.country, "India");
  assert.ok(business.rating === null || (business.rating >= 2.5 && business.rating <= 5));
}

const uniqueExternalIds = new Set(results.map((b) => b.external_id));
assert.strictEqual(uniqueExternalIds.size, results.length, "external_ids must be unique within a batch");

console.log("providers/business-search/mock.test.ts: all checks passed");
```

- [ ] **Step 4: Run the self-check**

Run: `npx tsx providers/business-search/mock.test.ts`
Expected: prints `providers/business-search/mock.test.ts: all checks passed` and exits 0.

- [ ] **Step 5: Add `BUSINESS_SEARCH_PROVIDER` to `.env.example`**

Add a new section at the end of `.env.example`:

```bash
# Business-search provider for lead generation (Phase 3). Only "mock" is
# implemented — it's a dev/test-only data generator, not a real integration.
# A real provider (e.g. Google Places) can be added later behind the same
# providers/business-search/index.ts factory.
BUSINESS_SEARCH_PROVIDER=mock
```

- [ ] **Step 6: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 7: Commit**

```bash
git add providers/business-search/index.ts providers/business-search/mock.ts providers/business-search/mock.test.ts .env.example
git commit -m "Add business-search provider abstraction with mock implementation"
```

---

### Task 4: Deduplication (pure matcher + org-scoped DB lookup)

**Files:**
- Create: `lib/lead-gen/deduplicate.ts`
- Create: `lib/lead-gen/deduplicate.test.ts`

**Interfaces:**
- Consumes: `RawBusiness` (Task 2), `normalizeDomain`/`normalizePhone`/`normalizeName` (Task 2)
- Produces: `ExistingLeadForDedup` interface, `findMatchingLead(business: RawBusiness, existingLeads: ExistingLeadForDedup[]): string | null` (pure, tested), `findDuplicateLeadId(supabase: SupabaseClient, organizationId: string, provider: string, business: RawBusiness): Promise<string | null>` (DB wrapper, used by Task 7's Inngest function).

- [ ] **Step 1: Create `lib/lead-gen/deduplicate.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDomain, normalizeName, normalizePhone } from "./normalize";
import type { RawBusiness } from "@/types/generation";

export interface ExistingLeadForDedup {
  id: string;
  business_name: string;
  website: string | null;
  phone: string | null;
  city: string | null;
  external_ids: string[];
}

// Match-key priority per docs/wibsity-sales-build-spec.md §30: external
// provider ID, then normalized website domain, then normalized phone,
// then normalized business name + city. First match wins.
export function findMatchingLead(
  business: RawBusiness,
  existingLeads: ExistingLeadForDedup[],
): string | null {
  if (business.external_id) {
    const match = existingLeads.find((lead) => lead.external_ids.includes(business.external_id!));
    if (match) return match.id;
  }

  const domain = normalizeDomain(business.website);
  if (domain) {
    const match = existingLeads.find((lead) => normalizeDomain(lead.website) === domain);
    if (match) return match.id;
  }

  const phone = normalizePhone(business.phone);
  if (phone) {
    const match = existingLeads.find((lead) => normalizePhone(lead.phone) === phone);
    if (match) return match.id;
  }

  const name = normalizeName(business.name).toLowerCase();
  const nameMatch = existingLeads.find(
    (lead) => normalizeName(lead.business_name).toLowerCase() === name && lead.city === business.city,
  );
  if (nameMatch) return nameMatch.id;

  return null;
}

interface LeadSourceRow {
  provider: string;
  external_id: string | null;
}

interface LeadRow {
  id: string;
  business_name: string;
  website: string | null;
  phone: string | null;
  city: string | null;
  lead_sources: LeadSourceRow[] | null;
}

// ponytail: O(n) full-org scan per result, done in application code rather
// than SQL, since normalized comparison (stripped domains/phones) isn't a
// plain column match. Add a normalized-domain/phone index or SQL-side
// lookup once org lead counts get large enough for this to matter.
export async function findDuplicateLeadId(
  supabase: SupabaseClient,
  organizationId: string,
  provider: string,
  business: RawBusiness,
): Promise<string | null> {
  const { data } = await supabase
    .from("leads")
    .select("id, business_name, website, phone, city, lead_sources(provider, external_id)")
    .eq("organization_id", organizationId);

  const existingLeads: ExistingLeadForDedup[] = ((data ?? []) as unknown as LeadRow[]).map((lead) => ({
    id: lead.id,
    business_name: lead.business_name,
    website: lead.website,
    phone: lead.phone,
    city: lead.city,
    external_ids: (lead.lead_sources ?? [])
      .filter((source) => source.provider === provider)
      .map((source) => source.external_id)
      .filter((id): id is string => Boolean(id)),
  }));

  return findMatchingLead(business, existingLeads);
}
```

- [ ] **Step 2: Create the self-check `lib/lead-gen/deduplicate.test.ts`**

```ts
import assert from "node:assert";
import { findMatchingLead, type ExistingLeadForDedup } from "./deduplicate";
import type { RawBusiness } from "@/types/generation";

function business(overrides: Partial<RawBusiness> = {}): RawBusiness {
  return {
    external_id: "biz-1",
    name: "Sun Solar Co",
    website: "https://www.sunsolar.com/",
    phone: "+91 99900 11122",
    email: null,
    industry: "Solar",
    city: "Noida",
    state: null,
    country: "India",
    rating: 4.5,
    review_count: 20,
    source_url: null,
    ...overrides,
  };
}

function lead(overrides: Partial<ExistingLeadForDedup> = {}): ExistingLeadForDedup {
  return {
    id: "lead-1",
    business_name: "Sun Solar Co",
    website: "https://sunsolar.com",
    phone: "919990011122",
    city: "Noida",
    external_ids: ["biz-1"],
    ...overrides,
  };
}

// 1. external_id match
assert.strictEqual(findMatchingLead(business(), [lead()]), "lead-1");

// 2. domain match (no external_id overlap)
assert.strictEqual(findMatchingLead(business({ external_id: null }), [lead({ external_ids: [] })]), "lead-1");

// 3. phone match (no external_id or domain overlap)
assert.strictEqual(
  findMatchingLead(business({ external_id: null, website: null }), [
    lead({ external_ids: [], website: null }),
  ]),
  "lead-1",
);

// 4. name + city match (no external_id/domain/phone overlap)
assert.strictEqual(
  findMatchingLead(business({ external_id: null, website: null, phone: null }), [
    lead({ external_ids: [], website: null, phone: null }),
  ]),
  "lead-1",
);

// 5. no match at all
assert.strictEqual(
  findMatchingLead(
    business({ external_id: null, website: null, phone: null, name: "Totally Different Co" }),
    [lead({ external_ids: [], website: null, phone: null })],
  ),
  null,
);

console.log("lib/lead-gen/deduplicate.test.ts: all checks passed");
```

- [ ] **Step 3: Run the self-check**

Run: `npx tsx lib/lead-gen/deduplicate.test.ts`
Expected: prints `lib/lead-gen/deduplicate.test.ts: all checks passed` and exits 0.

- [ ] **Step 4: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 5: Commit**

```bash
git add lib/lead-gen/deduplicate.ts lib/lead-gen/deduplicate.test.ts
git commit -m "Add lead deduplication matcher and org-scoped lookup"
```

---

### Task 5: Service-role client + generation DB helpers (org-scoping safeguard)

This is the task where the "service-role bypasses RLS" safeguard lives: every function here is written to take `organizationId` explicitly and filter by it, because nothing else will.

**Files:**
- Create: `lib/supabase/admin.ts`
- Create: `lib/lead-gen/job-store.ts`
- Create: `lib/lead-gen/create-lead.ts`

**Interfaces:**
- Consumes: `GenerationJob`, `GenerationResult`, `GenerationJobCounters`, `RawBusiness` (Task 2)
- Produces: `createAdminClient()` (`lib/supabase/admin.ts`); `getJob`, `markJobProcessing`, `markJobCompleted`, `markJobFailed`, `getResultsForJob`, `getPendingResults`, `insertPendingResults`, `markResultCreated`, `markResultFiltered`, `markResultDuplicate`, `recomputeJobCounters` (`lib/lead-gen/job-store.ts`); `createLeadFromBusiness` (`lib/lead-gen/create-lead.ts`) — all consumed by Task 7's Inngest function.

- [ ] **Step 1: Create `lib/supabase/admin.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

// Service-role client for background work with no user session (the
// Inngest function in lib/inngest/functions/). This bypasses RLS entirely
// (db/migrations/0003_grants.sql grants service_role full table access for
// exactly this) — never use it from a request path that has a session;
// use lib/supabase/server.ts there so RLS enforces org-scoping normally.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

- [ ] **Step 2: Create `lib/lead-gen/job-store.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationJob, GenerationJobCounters, GenerationResult, RawBusiness } from "@/types/generation";

const RESULT_COLUMNS = "id, generation_job_id, external_id, business_name, raw_data, status, lead_id, created_at";

export async function getJob(supabase: SupabaseClient, jobId: string): Promise<GenerationJob | null> {
  const { data } = await supabase.from("generation_jobs").select("*").eq("id", jobId).maybeSingle();
  return data as GenerationJob | null;
}

export async function markJobProcessing(supabase: SupabaseClient, jobId: string): Promise<void> {
  await supabase.from("generation_jobs").update({ status: "processing" }).eq("id", jobId);
}

export async function markJobCompleted(
  supabase: SupabaseClient,
  jobId: string,
  counters: GenerationJobCounters,
): Promise<void> {
  await supabase
    .from("generation_jobs")
    .update({ ...counters, status: "completed", completed_at: new Date().toISOString() })
    .eq("id", jobId);
}

export async function markJobFailed(
  supabase: SupabaseClient,
  jobId: string,
  errorMessage: string,
  counters: GenerationJobCounters,
): Promise<void> {
  await supabase
    .from("generation_jobs")
    .update({ ...counters, status: "failed", error: errorMessage })
    .eq("id", jobId);
}

export async function getResultsForJob(supabase: SupabaseClient, jobId: string): Promise<GenerationResult[]> {
  const { data } = await supabase.from("generation_results").select(RESULT_COLUMNS).eq("generation_job_id", jobId);
  return (data ?? []) as unknown as GenerationResult[];
}

export async function getPendingResults(supabase: SupabaseClient, jobId: string): Promise<GenerationResult[]> {
  const { data } = await supabase
    .from("generation_results")
    .select(RESULT_COLUMNS)
    .eq("generation_job_id", jobId)
    .eq("status", "pending");
  return (data ?? []) as unknown as GenerationResult[];
}

export async function insertPendingResults(
  supabase: SupabaseClient,
  jobId: string,
  businesses: RawBusiness[],
): Promise<void> {
  if (businesses.length === 0) return;
  const { error } = await supabase.from("generation_results").insert(
    businesses.map((business) => ({
      generation_job_id: jobId,
      external_id: business.external_id,
      business_name: business.name,
      raw_data: business,
      status: "pending",
    })),
  );
  if (error) throw new Error(`Failed to save discovered businesses: ${error.message}`);
}

export async function markResultCreated(supabase: SupabaseClient, resultId: string, leadId: string): Promise<void> {
  await supabase.from("generation_results").update({ status: "created", lead_id: leadId }).eq("id", resultId);
}

export async function markResultFiltered(supabase: SupabaseClient, resultId: string): Promise<void> {
  await supabase.from("generation_results").update({ status: "filtered" }).eq("id", resultId);
}

export async function markResultDuplicate(
  supabase: SupabaseClient,
  resultId: string,
  matchedLeadId: string,
): Promise<void> {
  await supabase.from("generation_results").update({ status: "duplicate", lead_id: matchedLeadId }).eq("id", resultId);
}

// Recomputed from current row states rather than incremented, so this is
// safe to call any number of times across retries/resumed runs without
// double-counting anything.
export async function recomputeJobCounters(supabase: SupabaseClient, jobId: string): Promise<GenerationJobCounters> {
  const { data } = await supabase.from("generation_results").select("status").eq("generation_job_id", jobId);

  const rows = (data ?? []) as Array<{ status: string }>;
  const found = rows.length;
  const analyzed = rows.filter((r) => r.status !== "pending").length;
  const qualified = rows.filter((r) => r.status === "created").length;
  const duplicate = rows.filter((r) => r.status === "duplicate").length;
  const progress = found > 0 ? Math.round((analyzed / found) * 100) : 0;

  const counters: GenerationJobCounters = {
    found_count: found,
    analyzed_count: analyzed,
    qualified_count: qualified,
    duplicate_count: duplicate,
    progress,
  };

  await supabase.from("generation_jobs").update(counters).eq("id", jobId);

  return counters;
}
```

- [ ] **Step 3: Create `lib/lead-gen/create-lead.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createActivity } from "@/lib/crm/activities";
import type { RawBusiness } from "@/types/generation";

// Called only from the org-scoped Inngest pipeline (Task 7): organizationId
// is the job's own organization_id, loaded once by the caller — never
// trust a caller-supplied org id from anywhere else.
export async function createLeadFromBusiness(
  supabase: SupabaseClient,
  organizationId: string,
  provider: string,
  business: RawBusiness,
  pipelineStageId: string | null,
  generationJobId: string,
): Promise<string> {
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      organization_id: organizationId,
      business_name: business.name,
      website: business.website,
      phone: business.phone,
      email: business.email,
      industry: business.industry,
      city: business.city,
      state: business.state,
      country: business.country,
      rating: business.rating,
      review_count: business.review_count,
      source: provider,
      source_url: business.source_url,
      pipeline_stage_id: pipelineStageId,
    })
    .select("id")
    .single();

  if (error || !lead) {
    throw new Error(`Failed to create lead for "${business.name}": ${error?.message ?? "unknown error"}`);
  }

  await supabase.from("lead_sources").insert({
    lead_id: lead.id,
    provider,
    external_id: business.external_id,
    source_url: business.source_url,
    raw_data: business,
  });

  await createActivity(supabase, lead.id, "created", "Lead created from generation", {
    generation_job_id: generationJobId,
  });

  return lead.id as string;
}
```

- [ ] **Step 4: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/admin.ts lib/lead-gen/job-store.ts lib/lead-gen/create-lead.ts
git commit -m "Add service-role client and org-scoped generation DB helpers"
```

---

### Task 6: Inngest client + Next.js route

**Files:**
- Create: `lib/inngest/client.ts`
- Create: `app/api/inngest/route.ts`
- Modify: `.env.example`
- Modify (already-changed, needs committing): `package.json`, `package-lock.json` (the `inngest` dependency is already installed in `node_modules`)

**Interfaces:**
- Produces: `inngest` client instance (`lib/inngest/client.ts`) — used by Task 7 (function definition) and Task 8 (`inngest.send`).

- [ ] **Step 1: Create `lib/inngest/client.ts`**

```ts
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "wibsity-sales" });
```

- [ ] **Step 2: Create `app/api/inngest/route.ts`**

This references `generateLeads`, which doesn't exist until Task 7. Create a temporary empty functions array here; Task 7 will update this file to register the real function.

```ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [],
});
```

- [ ] **Step 3: Add Inngest keys to `.env.example`**

Add to the same new section started in Task 3:

```bash
# Inngest (background jobs — see docs/wibsity-sales-build-spec.md "Background
# jobs"). Not needed for local dev: run `npx inngest-cli dev` alongside
# `npm run dev` and it auto-discovers app/api/inngest with no keys. Required
# in production.
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

- [ ] **Step 4: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json lib/inngest/client.ts app/api/inngest/route.ts .env.example
git commit -m "Add Inngest client and Next.js route handler"
```

---

### Task 7: The Inngest function — resumable, idempotent generation pipeline

This is the task that implements all three of: resumable discovery, per-result idempotent processing, and the `onFailure` safeguard that preserves partial success.

**Files:**
- Create: `lib/inngest/functions/generate-leads.ts`
- Modify: `app/api/inngest/route.ts` (register the function)

**Interfaces:**
- Consumes: `inngest` (Task 6), `createAdminClient` (Task 5), `getBusinessSearchProvider` (Task 3), `passesFilters` (Task 2), `findDuplicateLeadId` (Task 4), `createLeadFromBusiness` (Task 5), all of `lib/lead-gen/job-store.ts` (Task 5), `getPipelineStages` from `lib/crm/pipeline.ts` (existing)
- Produces: `generateLeads` (the Inngest function) — registered in `app/api/inngest/route.ts`, triggered by event `leadgen/job.created` with payload `{ jobId: string }` (sent by Task 8's server actions).

- [ ] **Step 1: Create `lib/inngest/functions/generate-leads.ts`**

```ts
import { NonRetriableError } from "inngest";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBusinessSearchProvider } from "@/providers/business-search";
import { passesFilters } from "@/lib/lead-gen/qualify";
import { findDuplicateLeadId } from "@/lib/lead-gen/deduplicate";
import { createLeadFromBusiness } from "@/lib/lead-gen/create-lead";
import { getPipelineStages } from "@/lib/crm/pipeline";
import {
  getJob,
  getResultsForJob,
  getPendingResults,
  insertPendingResults,
  markJobProcessing,
  markJobCompleted,
  markJobFailed,
  markResultCreated,
  markResultFiltered,
  markResultDuplicate,
  recomputeJobCounters,
} from "@/lib/lead-gen/job-store";

const PROVIDER_NAME = "mock";

export const generateLeads = inngest.createFunction(
  {
    id: "generate-leads",
    // Dedupes concurrent/duplicate triggers of the same job (e.g. a flaky
    // client double-sending the event) so only one run per jobId proceeds.
    idempotency: "event.data.jobId",
    // Runs once Inngest's own retries are exhausted. Does NOT roll back
    // anything already-created steps did — partial success (leads already
    // created) is preserved, only the job's own status/counters are set.
    onFailure: async ({ event, error }) => {
      const jobId = (event.data.event.data as { jobId: string }).jobId;
      const supabase = createAdminClient();
      const counters = await recomputeJobCounters(supabase, jobId);
      await markJobFailed(supabase, jobId, error.message, counters);
    },
  },
  { event: "leadgen/job.created" },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string };
    const supabase = createAdminClient();

    const job = await step.run("load-job", () => getJob(supabase, jobId));
    if (!job) throw new NonRetriableError(`generation_jobs row ${jobId} not found`);

    await step.run("mark-processing", () => markJobProcessing(supabase, jobId));

    // Resumability: if results already exist for this job (a resumed or
    // retried run — not necessarily the same Inngest run), discovery is
    // skipped entirely and we go straight to processing what's left.
    const existingResults = await step.run("check-existing-results", () => getResultsForJob(supabase, jobId));

    if (existingResults.length === 0) {
      const businesses = await step.run("discover", () => {
        const provider = getBusinessSearchProvider();
        return provider.search({
          industry: job.industry,
          location: job.location,
          count: job.requested_count,
        });
      });
      await step.run("save-discovered-results", () => insertPendingResults(supabase, jobId, businesses));
    }

    const newStage = await step.run("load-new-stage", async () => {
      const stages = await getPipelineStages(supabase, job.organization_id);
      return stages.find((stage) => stage.slug === "new") ?? null;
    });

    // Only ever selects rows still 'pending' — already-resolved rows
    // (created/filtered/duplicate) from an earlier attempt are never
    // touched again, which is what makes retries safe.
    const pending = await step.run("load-pending-results", () => getPendingResults(supabase, jobId));

    for (const result of pending) {
      await step.run(`process-result-${result.id}`, async () => {
        const business = result.raw_data;
        const duplicateLeadId = await findDuplicateLeadId(supabase, job.organization_id, PROVIDER_NAME, business);

        if (duplicateLeadId) {
          await markResultDuplicate(supabase, result.id, duplicateLeadId);
          return;
        }

        const qualifies = passesFilters(business, {
          minRating: job.min_rating,
          websiteRequired: job.website_required,
          phoneRequired: job.phone_required,
        });

        if (!qualifies) {
          await markResultFiltered(supabase, result.id);
          return;
        }

        const leadId = await createLeadFromBusiness(
          supabase,
          job.organization_id,
          PROVIDER_NAME,
          business,
          newStage?.id ?? null,
          jobId,
        );
        await markResultCreated(supabase, result.id, leadId);
      });

      await step.run(`recompute-counters-${result.id}`, () => recomputeJobCounters(supabase, jobId));
    }

    const finalCounters = await step.run("finalize-counters", () => recomputeJobCounters(supabase, jobId));
    await step.run("mark-completed", () => markJobCompleted(supabase, jobId, finalCounters));

    return finalCounters;
  },
);
```

- [ ] **Step 2: Register the function in `app/api/inngest/route.ts`**

Replace the file's contents:

```ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { generateLeads } from "@/lib/inngest/functions/generate-leads";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateLeads],
});
```

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean. (This checks types/wiring only — the pipeline can't be exercised end-to-end until Task 8's server action can trigger it; that happens in Task 10's manual verification.)

- [ ] **Step 4: Commit**

```bash
git add lib/inngest/functions/generate-leads.ts app/api/inngest/route.ts
git commit -m "Add resumable, idempotent Inngest lead-generation function"
```

---

### Task 8: Server actions — submit and retry

**Files:**
- Create: `app/(dashboard)/leads/new/actions.ts`

**Interfaces:**
- Consumes: `generationFormSchema` (Task 2), `inngest` (Task 6)
- Produces: `GenerationFormState`, `submitGenerationAction(prevState: GenerationFormState, formData: FormData): Promise<GenerationFormState>`, `retryGenerationAction(jobId: string): Promise<void>` — consumed by Task 9 and Task 10's UI.

- [ ] **Step 1: Create `app/(dashboard)/leads/new/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { generationFormSchema } from "@/lib/lead-gen/schemas";

export interface GenerationFormState {
  error: string | null;
  fieldErrors: Record<string, string[] | undefined>;
}

// A signed-in user's organization_id, derived from their session — never
// trust an organization id supplied by the client itself (see
// docs/wibsity-sales-build-spec.md's "never expose provider API keys to
// browser" rule and the equivalent trust boundary for org identity).
async function getSessionOrganizationId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user!.id)
    .single();
  return profile!.organization_id as string;
}

export async function submitGenerationAction(
  _prevState: GenerationFormState,
  formData: FormData,
): Promise<GenerationFormState> {
  const parsed = generationFormSchema.safeParse({
    industry: formData.get("industry"),
    location: formData.get("location"),
    requestedCount: formData.get("requestedCount"),
    minRating: formData.get("minRating") || undefined,
    websiteRequired: formData.get("websiteRequired"),
    phoneRequired: formData.get("phoneRequired"),
  });

  if (!parsed.success) {
    return { error: null, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const organizationId = await getSessionOrganizationId(supabase);
  const input = parsed.data;

  const { data: job, error } = await supabase
    .from("generation_jobs")
    .insert({
      organization_id: organizationId,
      industry: input.industry,
      location: input.location,
      requested_count: input.requestedCount,
      min_rating: input.minRating ?? null,
      website_required: input.websiteRequired,
      phone_required: input.phoneRequired,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !job) {
    return { error: "Could not start lead generation. Please try again.", fieldErrors: {} };
  }

  await inngest.send({ name: "leadgen/job.created", data: { jobId: job.id } });

  redirect(`/leads/new?job=${job.id}`);
}

export async function retryGenerationAction(jobId: string): Promise<void> {
  const supabase = await createClient();
  const organizationId = await getSessionOrganizationId(supabase);

  const { data: job } = await supabase
    .from("generation_jobs")
    .select("id, status")
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .single();

  if (!job || job.status !== "failed") return;

  await supabase.from("generation_jobs").update({ status: "pending", error: null }).eq("id", jobId);
  await inngest.send({ name: "leadgen/job.created", data: { jobId } });
}
```

- [ ] **Step 2: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/leads/new/actions.ts"
git commit -m "Add submit and retry server actions for lead generation"
```

---

### Task 9: Generation form + `/leads/new` page

**Files:**
- Create: `components/leads/generation-form.tsx`
- Modify: `app/(dashboard)/leads/new/page.tsx` (replace stub with the real form; Task 10 will extend this to also render progress)

**Interfaces:**
- Consumes: `submitGenerationAction`, `GenerationFormState` (Task 8)
- Produces: `GenerationForm` component, used by `app/(dashboard)/leads/new/page.tsx`.

- [ ] **Step 1: Create `components/leads/generation-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitGenerationAction, type GenerationFormState } from "@/app/(dashboard)/leads/new/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

const initialState: GenerationFormState = { error: null, fieldErrors: {} };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Starting..." : "Generate leads"}
    </Button>
  );
}

export function GenerationForm() {
  const [state, formAction] = useActionState(submitGenerationAction, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="industry">Industry</FieldLabel>
        <Input id="industry" name="industry" placeholder="Solar companies" />
        {state.fieldErrors.industry && (
          <p className="text-sm text-destructive">{state.fieldErrors.industry[0]}</p>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="location">Location</FieldLabel>
        <Input id="location" name="location" placeholder="Noida" />
        {state.fieldErrors.location && (
          <p className="text-sm text-destructive">{state.fieldErrors.location[0]}</p>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="requestedCount">Number of leads</FieldLabel>
        <Input id="requestedCount" name="requestedCount" type="number" min={1} max={100} defaultValue={50} />
        {state.fieldErrors.requestedCount && (
          <p className="text-sm text-destructive">{state.fieldErrors.requestedCount[0]}</p>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="minRating">Minimum rating</FieldLabel>
        <Input id="minRating" name="minRating" type="number" min={0} max={5} step={0.1} placeholder="3.5" />
        {state.fieldErrors.minRating && (
          <p className="text-sm text-destructive">{state.fieldErrors.minRating[0]}</p>
        )}
      </Field>

      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input type="checkbox" name="websiteRequired" defaultChecked />
        Website required
      </label>

      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input type="checkbox" name="phoneRequired" defaultChecked />
        Only businesses with phone
      </label>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <SubmitButton />
    </form>
  );
}
```

- [ ] **Step 2: Replace `app/(dashboard)/leads/new/page.tsx`**

```tsx
import { PageHeader } from "@/components/page-header";
import { GenerationForm } from "@/components/leads/generation-form";

export default function NewLeadGenerationPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Generate leads" />
      <GenerationForm />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

Then run `npm run dev`, sign in with the seeded operator, and visit `/leads/new`. Confirm the form renders with the fields above (both checkboxes pre-checked, count defaulting to 50) and that submitting with an empty Industry shows the "Industry is required" field error without a page crash.

- [ ] **Step 4: Commit**

```bash
git add components/leads/generation-form.tsx "app/(dashboard)/leads/new/page.tsx"
git commit -m "Add generation form and wire it into /leads/new"
```

---

### Task 10: Generation progress (polling) + Retry, wired end-to-end

**Files:**
- Create: `components/leads/generation-progress.tsx`
- Modify: `app/(dashboard)/leads/new/page.tsx` (render progress when a `?job=` query param is present)

**Interfaces:**
- Consumes: `retryGenerationAction` (Task 8), `GenerationJob` (Task 2), `createClient` from `lib/supabase/client.ts` (existing)
- Produces: `GenerationProgress` component.

- [ ] **Step 1: Create `components/leads/generation-progress.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { retryGenerationAction } from "@/app/(dashboard)/leads/new/actions";
import { Button } from "@/components/ui/button";
import type { GenerationJob } from "@/types/generation";

const POLL_INTERVAL_MS = 1500;
const JOB_COLUMNS = "id, status, progress, found_count, analyzed_count, qualified_count, duplicate_count, error";

type JobProgress = Pick<
  GenerationJob,
  "id" | "status" | "progress" | "found_count" | "analyzed_count" | "qualified_count" | "duplicate_count" | "error"
>;

export function GenerationProgress({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<JobProgress | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;

    async function poll() {
      const { data } = await supabase.from("generation_jobs").select(JOB_COLUMNS).eq("id", jobId).maybeSingle();
      if (stopped || !data) return;

      const current = data as unknown as JobProgress;
      setJob(current);
      if (current.status === "completed" || current.status === "failed") {
        stopped = true;
        clearInterval(interval);
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    poll();

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [jobId]);

  if (!job) return <p className="text-sm text-muted-foreground">Loading...</p>;

  if (job.status === "failed") {
    return (
      <div className="flex max-w-md flex-col gap-3">
        <p className="text-sm text-destructive">{job.error ?? "Lead generation failed."}</p>
        <form action={retryGenerationAction.bind(null, jobId)}>
          <Button type="submit" size="sm">
            Retry
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex max-w-md flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {job.status === "completed" ? "Done." : "Finding businesses..."}
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${job.progress}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Found</dt>
        <dd className="text-right font-medium">{job.found_count}</dd>
        <dt className="text-muted-foreground">Analyzed</dt>
        <dd className="text-right font-medium">{job.analyzed_count}</dd>
        <dt className="text-muted-foreground">Qualified</dt>
        <dd className="text-right font-medium">{job.qualified_count}</dd>
        <dt className="text-muted-foreground">Duplicates</dt>
        <dd className="text-right font-medium">{job.duplicate_count}</dd>
      </dl>
    </div>
  );
}
```

- [ ] **Step 2: Update `app/(dashboard)/leads/new/page.tsx` to render progress when a job is in progress**

```tsx
import { PageHeader } from "@/components/page-header";
import { GenerationForm } from "@/components/leads/generation-form";
import { GenerationProgress } from "@/components/leads/generation-progress";

export default async function NewLeadGenerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const jobId = params.job;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Generate leads" />
      {jobId ? <GenerationProgress jobId={jobId} /> : <GenerationForm />}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 4: Commit**

```bash
git add components/leads/generation-progress.tsx "app/(dashboard)/leads/new/page.tsx"
git commit -m "Add generation progress polling UI with retry"
```

---

### Task 11: End-to-end manual verification (idempotency + org-scoping) and README update

This task has no new source files — it's the manual verification pass the design doc calls for, since resumability and org-scoping need the real Inngest dev server and a live Supabase project to observe, not a unit test.

**Files:**
- Modify: `README.md` (setup step for running Inngest locally, `/leads/new` status row)

- [ ] **Step 1: Start both dev processes**

Run in one terminal: `npm run dev`
Run in another terminal: `npx inngest-cli dev`

Expected: the Inngest dev server auto-discovers `http://localhost:3000/api/inngest` and shows `generate-leads` registered in its UI (usually `http://localhost:8288`).

- [ ] **Step 2: Verify a normal job completes and creates leads**

In the browser, sign in with the seeded operator, go to `/leads/new`, submit a job (e.g. industry "Solar companies", location "Noida", count 20, both checkboxes checked). Confirm:
- The page redirects to `/leads/new?job=<id>` and shows progress counters advancing to completion.
- Visiting `/leads` shows new leads with `source = "mock"` and pipeline stage "New".
- Each created lead's activity timeline (`/leads/[id]`) shows a "Lead created from generation" entry.

- [ ] **Step 3: Verify org-scoping**

If a second organization/user is available (or by temporarily editing a job's `organization_id` directly in Supabase's Table Editor for this check only, then reverting it), confirm a user cannot see or poll another organization's `generation_jobs` row — the `/leads/new?job=<other org's id>` progress view should show nothing (RLS returns no row), never that job's data.

- [ ] **Step 4: Verify idempotent retry preserves leads and doesn't duplicate**

Force a failure to exercise the retry path: temporarily set `BUSINESS_SEARCH_PROVIDER=not-a-real-provider` in `.env.local`, restart `npm run dev`, submit a job — it should reach `status: 'failed'` (the provider factory throws). Set `BUSINESS_SEARCH_PROVIDER` back to `mock`, restart, then click Retry on that failed job. Confirm:
- The job resumes and completes successfully.
- No duplicate `leads` rows were created from the failed attempt (there shouldn't be any, since the mock provider throws before any results are saved in this particular failure mode — the check here is that the retry runs the discovery step itself, since `generation_results` was never populated the first time).

For a partial-success case: after a job has fully completed once, manually re-send `leadgen/job.created` with the same `jobId` (via the Inngest dev server's UI "Send event" tool, or by temporarily calling `retryGenerationAction` on a completed job id from a scratch script). Confirm the second run's `getPendingResults` returns nothing (all rows already resolved), no new leads are created, and the job's counters stay the same.

- [ ] **Step 5: Update README**

In `README.md`, add an Inngest line to the setup steps (after step 5, "Run the app"):

```markdown
6. **Run background jobs locally** (needed for `/leads/new` to actually generate leads):

   ```bash
   npx inngest-cli dev
   ```

   This auto-discovers `app/api/inngest` with no keys needed in development.
```

Update the `/leads/new` row (and the surrounding `/leads`, `/pipeline` rows, which are stale from Phase 2 shipping) in the "What's real vs. a Phase 1 stub" table to:

```markdown
| `/leads`, `/leads/[id]` | Real: search, filters, notes, activity timeline, follow-ups (Phase 2) |
| `/pipeline` | Real: drag-and-drop stage changes (Phase 2) |
| `/leads/new` | Real: async generation via Inngest, mock provider only (Phase 3) |
```

- [ ] **Step 6: Final verification**

Run: `npm run build && npm run lint`
Run: `npx tsx lib/lead-gen/normalize.test.ts && npx tsx lib/lead-gen/qualify.test.ts && npx tsx lib/lead-gen/deduplicate.test.ts && npx tsx providers/business-search/mock.test.ts`
Expected: everything passes clean.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "Document Inngest local dev setup and update Phase 3 status in README"
```

---

## Self-Review Notes

- **Spec coverage:** generation form (§8, Task 9) ✓; provider abstraction (§23, Task 3) ✓; async jobs (§Background jobs, Tasks 6-7) ✓; normalization (§30, Task 2) ✓; deduplication (§30, Task 4) ✓; progress UI + failure UX (§27, Task 10) ✓; the four architectural safeguards (provider seam, idempotent/resumable jobs, org-scoped security, idempotent Inngest processing) are addressed across Tasks 3, 5, and 7, called out explicitly in Global Constraints and in code comments at their point of use.
- **Out of scope confirmed absent from tasks:** no website fetch/audit code, no scoring, no AI, no real Google Places implementation, no new RLS policies, no react-hook-form usage.
