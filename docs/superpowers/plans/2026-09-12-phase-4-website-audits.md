# Phase 4: Website Audits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user run a real, asynchronous audit of a lead's website from the lead detail page — fetch the site, run deterministic technical checks, compute per-category scores, generate an AI summary/talking points from that evidence, and show the results on the lead, in an `/audits` list, and on an `/audits/[id]` detail page.

**Architecture:** A server action inserts a `website_audits` row and fires an Inngest event; one Inngest function (service-role client, no user session) fetches the site, runs checks, computes scores, calls a swappable AI-interpreter provider, and persists issues + the completed audit. The client polls the `website_audits` row for progress through the normal RLS-protected browser client — the same shape as Phase 3's `generate-leads` pipeline, reused deliberately rather than redesigned.

**Tech Stack:** Next.js App Router + Server Actions, Supabase (Postgres, RLS, `@supabase/supabase-js`), Inngest v4 (already a dependency), `cheerio` (new — HTML parsing, no headless browser).

**Spec:**
- `docs/wibsity-sales-build-spec.md` §11 (lead detail audit block), §13 (`/audits`, `/audits/[id]`), §14 (deterministic checks, AI interpretation rules), §19 (`website_audits`/`audit_issues` schema), §38 (acceptance criteria)
- `docs/superpowers/specs/2026-09-12-phase-4-website-audits-design.md`

## Global Constraints

- Scope stops at the audit engine. No lead-scoring formula, no `leads.score`/`score_category` changes — that's its own follow-up phase. No performance metrics (no headless browser/PageSpeed API) — `performance_score` stays permanently `null`. No broken-link crawling. No JS-rendered content (plain HTML fetch only). No real AI provider/key — only the `mock` interpreter ships.
- Reuse existing Phase 3 infrastructure, do not recreate it: `lib/supabase/admin.ts` (`createAdminClient()`), `lib/inngest/client.ts` (`inngest`), `lib/crm/activities.ts` (`createActivity`), `app/api/inngest/route.ts` (add to the existing `functions` array, don't replace it).
- Follow existing codebase conventions exactly:
  - `lib/*/*.ts`-style functions: `async function name(supabase: SupabaseClient, ...ids, ...args)`, snake_case fields matching DB columns exactly.
  - Self-checks are plain `assert`-based `*.test.ts` files run via `npx tsx <path>` — only pure/logic functions get one (checks, scoring, the mock interpreter); DB- or network-touching helpers don't (matches `lib/lead-gen/job-store.ts` having no test).
  - Page components fetch `organization_id` via `supabase.auth.getUser()` then `.from("users").select("organization_id").eq("id", user.id).single()`.
  - Client components trigger server actions via `startTransition` + a plain `<form action={...}>`, exactly like `components/leads/follow-up-card.tsx` — not `react-hook-form` (installed but unused anywhere in this codebase).
- RLS already fully covers `website_audits` and `audit_issues` (`db/migrations/0002_rls_policies.sql`), scoped via the `leads` join — do **not** add or modify RLS policies. New columns on `website_audits` inherit the existing policy automatically (same precedent as Phase 3's migration 0004).
- The Inngest function runs outside any user session and must use `createAdminClient()`, which bypasses RLS entirely — every query it issues must be scoped by an id/relationship already loaded from a trusted row (the audit's own `lead_id`), never by anything else.
- **No event-level `idempotency` key on the Inngest function.** Phase 3's Task 11 found that Inngest's idempotency dedup silently drops a legitimate retry that resends the same id (a retry *has to* reuse the same id) — this cost real debugging time once already. Don't repeat it.
- `audit_issues` rows are replaced, not accumulated, on every completed run (`saveIssues` deletes existing rows for the audit before inserting the fresh set) — an audit is a single atomic fetch-and-check, not a resumable multi-item loop like Phase 3's lead discovery, so there's no "already-resolved item" state worth preserving across a re-run.
- Database migrations are applied manually via the Supabase SQL Editor (no migration runner) — `README.md` lists them in order; add the new one to that list.
- Verified after every task: `npm run build` and `npm run lint` both pass clean; any self-check test in that task passes via `npx tsx`.

---

### Task 1: Migration — website_audits pending/processing status

**Files:**
- Create: `db/migrations/0005_website_audit_status.sql`
- Modify: `README.md` (migration list)

**Interfaces:**
- Produces: `website_audits.status` (text, not null, default `'pending'`, one of `pending`/`processing`/`completed`/`failed`), `website_audits.error` (text, nullable); `overall_score` and `summary` become nullable — every later task in this plan reads/writes these.

- [ ] **Step 1: Write the migration**

```sql
-- wibsity sales: Phase 4 website audit additions.
-- website_audits currently requires overall_score/summary NOT NULL, which
-- leaves no room for a pending/processing row while an audit is running.
-- Mirrors generation_jobs' status/error pattern (Phase 3) so the same
-- async-job-with-polling-progress architecture applies uniformly. No RLS
-- changes needed: the existing org_isolation policy (scoped via the leads
-- join, db/migrations/0002_rls_policies.sql) already covers new columns.

alter table website_audits
  alter column overall_score drop not null,
  alter column summary drop not null,
  add column status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  add column error text;
```

Running this against a database with existing `website_audits` rows (e.g. seed data) backfills every row's `status` as `'pending'` via the column default — including rows that already have real `overall_score`/`summary` data from a completed audit. Correct that with a follow-up statement in the same migration file:

```sql
update website_audits set status = 'completed' where overall_score is not null;
```

- [ ] **Step 2: Run the migration**

Run `db/migrations/0005_website_audit_status.sql` in the Supabase SQL Editor against the project's database (this repo has no automated migration runner — see `README.md` step 3).

Expected: no errors; `website_audits` shows `status` and `error` columns in the Supabase Table Editor, and `overall_score`/`summary` show as nullable.

- [ ] **Step 3: Update README's migration list**

In `README.md`, in the "Run the database migrations" list (after the `0004_generation_job_filters_and_result_lead_id.sql` bullet), add:

```markdown
   - `db/migrations/0005_website_audit_status.sql`: Phase 4 website audit
     pending/processing status tracking
```

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0005_website_audit_status.sql README.md
git commit -m "Add website audit status tracking migration"
```

---

### Task 2: Types, deterministic checks, and scoring

**Files:**
- Create: `types/audit.ts`
- Create: `lib/audits/checks.ts`
- Create: `lib/audits/checks.test.ts`
- Create: `lib/audits/score.ts`
- Create: `lib/audits/score.test.ts`
- Modify (already-changed, needs committing): `package.json`, `package-lock.json` (the `cheerio` dependency is already installed in `node_modules`)

**Interfaces:**
- Produces: `AuditStatus`, `AuditCategory`, `IssueSeverity`, `WebsiteAudit`, `AuditIssue`, `CheckFinding`, `CategoryScores`, `AuditEvidence`, `AiInterpretation` (all `types/audit.ts`); `checkTitle`, `checkMetaDescription`, `checkHeadingStructure`, `checkAltText`, `checkViewport`, `checkAboveFoldCta`, `checkContactMethod`, `checkSocialLinks`, `checkHttps`, `runAllChecks(page: CheerioAPI): CheckFinding[]` (`lib/audits/checks.ts`); `computeCategoryScores(findings: CheckFinding[]): CategoryScores`, `computeOverallScore(scores: CategoryScores): number`, `severityForPoints(points: number): IssueSeverity` (`lib/audits/score.ts`). All consumed by Tasks 3, 4, 5, and 6.

- [ ] **Step 1: Create `types/audit.ts`**

```ts
export type AuditStatus = "pending" | "processing" | "completed" | "failed";
export type AuditCategory = "seo" | "mobile" | "conversion" | "technical";
export type IssueSeverity = "high" | "medium" | "low";

export interface WebsiteAudit {
  id: string;
  lead_id: string;
  status: AuditStatus;
  overall_score: number | null;
  performance_score: number | null;
  mobile_score: number | null;
  seo_score: number | null;
  conversion_score: number | null;
  summary: string | null;
  raw_results: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditIssue {
  id: string;
  audit_id: string;
  category: AuditCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  evidence: Record<string, unknown> | null;
  created_at: string;
}

// One check's outcome, before any of it becomes a persisted AuditIssue row.
// `points` is how much the check deducts from its category score if failed
// (technical-category findings carry a points value too, for severity
// classification only — they never affect a category score).
export interface CheckFinding {
  category: AuditCategory;
  points: number;
  passed: boolean;
  title: string;
  description: string;
  evidence: Record<string, unknown> | null;
}

export interface CategoryScores {
  seo: number;
  mobile: number;
  conversion: number;
}

export interface AuditEvidence {
  reachable: boolean;
  categoryScores: CategoryScores | null;
  findings: CheckFinding[];
}

export interface AiInterpretation {
  summary: string;
  talkingPoints: string[];
}
```

- [ ] **Step 2: Create `lib/audits/checks.ts`**

```ts
import type { CheerioAPI } from "cheerio";
import type { CheckFinding } from "@/types/audit";

// A plain HTTP fetch + HTML parse (see lib/audits/fetch-website.ts) can't
// execute JS or measure real layout, so every check here is a heuristic
// proxy for the real thing — documented as such in each description.

export function checkTitle($: CheerioAPI): CheckFinding {
  const title = $("title").first().text().trim();
  const passed = title.length >= 10 && title.length <= 60;
  return {
    category: "seo",
    points: 30,
    passed,
    title: "Page title",
    description: !title
      ? "No <title> tag was found."
      : passed
        ? `Title is ${title.length} characters, within the recommended range.`
        : `Title is ${title.length} characters — outside the recommended 10-60 character range.`,
    evidence: { title: title || null },
  };
}

export function checkMetaDescription($: CheerioAPI): CheckFinding {
  const content = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const passed = content.length >= 50 && content.length <= 160;
  return {
    category: "seo",
    points: 25,
    passed,
    title: "Meta description",
    description: !content
      ? "No meta description was found."
      : passed
        ? `Meta description is ${content.length} characters, within the recommended range.`
        : `Meta description is ${content.length} characters — outside the recommended 50-160 character range.`,
    evidence: { description: content || null },
  };
}

export function checkHeadingStructure($: CheerioAPI): CheckFinding {
  const h1Count = $("h1").length;
  const passed = h1Count === 1;
  return {
    category: "seo",
    points: 20,
    passed,
    title: "Heading structure",
    description:
      h1Count === 0
        ? "No <h1> heading was found."
        : h1Count === 1
          ? "Exactly one <h1> heading was found."
          : `${h1Count} <h1> headings were found — a page should have exactly one.`,
    evidence: { h1Count },
  };
}

export function checkAltText($: CheerioAPI): CheckFinding {
  const images = $("img");
  const total = images.length;
  const withAlt = images.filter((_, el) => Boolean($(el).attr("alt")?.trim())).length;
  const coverage = total === 0 ? 1 : withAlt / total;
  const passed = coverage >= 0.8;
  return {
    category: "seo",
    points: 25,
    passed,
    title: "Image alt text",
    description:
      total === 0
        ? "No images were found on the page."
        : `${withAlt} of ${total} images (${Math.round(coverage * 100)}%) have alt text.`,
    evidence: { total, withAlt },
  };
}

export function checkViewport($: CheerioAPI): CheckFinding {
  const passed = $('meta[name="viewport"]').length > 0;
  return {
    category: "mobile",
    points: 100,
    passed,
    title: "Mobile viewport",
    description: passed
      ? "A viewport meta tag was found."
      : "No viewport meta tag was found. This is a heuristic signal only, not a rendering test, but its absence strongly suggests the page isn't optimized for mobile screens.",
    evidence: null,
  };
}

const CTA_WORDS = ["contact", "call", "book", "quote", "buy", "get started", "sign up", "order", "schedule"];

export function checkAboveFoldCta($: CheerioAPI): CheckFinding {
  // "Above the fold" heuristic: without real layout/rendering, treat the
  // first <h2> as the boundary (content past the first subheading is
  // typically below an initial hero/CTA area); if there's no <h2>, use the
  // first 40% of the combined element sequence instead. A single combined
  // selector is used so results come back in true document order.
  const ordered = $("h2, button, a").toArray();
  const h2Index = ordered.findIndex((el) => el.tagName === "h2");
  const cutoff = h2Index >= 0 ? h2Index : Math.ceil(ordered.length * 0.4);

  const hasCta = ordered.some((el, index) => {
    if (index >= cutoff) return false;
    if (el.tagName !== "button" && el.tagName !== "a") return false;
    const text = $(el).text().trim().toLowerCase();
    return CTA_WORDS.some((word) => text.includes(word));
  });

  return {
    category: "conversion",
    points: 40,
    passed: hasCta,
    title: "Above-the-fold call to action",
    description: hasCta
      ? "A call-to-action element was found near the top of the page."
      : "No clear call-to-action (e.g. Contact, Call, Book, Get a quote) was found near the top of the page.",
    evidence: null,
  };
}

export function checkContactMethod($: CheerioAPI): CheckFinding {
  const hasTel = $('a[href^="tel:"]').length > 0;
  const hasMailto = $('a[href^="mailto:"]').length > 0;
  const hasForm = $("form").length > 0;
  const passed = hasTel || hasMailto || hasForm;
  return {
    category: "conversion",
    points: 40,
    passed,
    title: "Contact method",
    description: passed
      ? "A phone link, email link, or contact form was found."
      : "No phone link, email link, or contact form was found.",
    evidence: { hasTel, hasMailto, hasForm },
  };
}

const SOCIAL_HOSTS = ["facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com", "wa.me", "whatsapp.com"];

export function checkSocialLinks($: CheerioAPI): CheckFinding {
  const links = $("a[href]")
    .toArray()
    .map((el) => $(el).attr("href") ?? "");
  const passed = links.some((href) => SOCIAL_HOSTS.some((host) => href.includes(host)));
  return {
    category: "conversion",
    points: 20,
    passed,
    title: "Social links",
    description: passed ? "At least one social media link was found." : "No social media links were found.",
    evidence: null,
  };
}

// Cross-cutting: not scored into any category, but always recorded as an
// issue when it fails (see lib/audits/score.ts — "technical" category
// findings never affect computeCategoryScores). Takes the final URL after
// redirects (see fetch-website.ts) rather than the stored website value,
// so an http -> https redirect is correctly read as passing.
export function checkHttps(finalUrl: string): CheckFinding {
  const passed = finalUrl.toLowerCase().startsWith("https://");
  return {
    category: "technical",
    points: 30,
    passed,
    title: "HTTPS",
    description: passed ? "The site is served over HTTPS." : "The site is served over plain HTTP, not HTTPS.",
    evidence: { url: finalUrl },
  };
}

export function runAllChecks($: CheerioAPI): CheckFinding[] {
  return [
    checkTitle($),
    checkMetaDescription($),
    checkHeadingStructure($),
    checkAltText($),
    checkViewport($),
    checkAboveFoldCta($),
    checkContactMethod($),
    checkSocialLinks($),
  ];
}
```

- [ ] **Step 3: Create the self-check `lib/audits/checks.test.ts`**

```ts
import assert from "node:assert";
import * as cheerio from "cheerio";
import {
  checkTitle,
  checkMetaDescription,
  checkHeadingStructure,
  checkAltText,
  checkViewport,
  checkAboveFoldCta,
  checkContactMethod,
  checkSocialLinks,
  checkHttps,
} from "./checks";

const load = (html: string) => cheerio.load(html);

assert.strictEqual(checkTitle(load("<title>A Good Enough Title Here</title>")).passed, true);
assert.strictEqual(checkTitle(load("<title>Hi</title>")).passed, false);
assert.strictEqual(checkTitle(load("<html><head></head></html>")).passed, false);

assert.strictEqual(
  checkMetaDescription(load(`<meta name="description" content="${"A".repeat(80)}">`)).passed,
  true,
);
assert.strictEqual(checkMetaDescription(load("<html></html>")).passed, false);

assert.strictEqual(checkHeadingStructure(load("<h1>Only one</h1>")).passed, true);
assert.strictEqual(checkHeadingStructure(load("<h1>One</h1><h1>Two</h1>")).passed, false);
assert.strictEqual(checkHeadingStructure(load("<p>No headings</p>")).passed, false);

assert.strictEqual(
  checkAltText(load('<img src="a.jpg" alt="a"><img src="b.jpg" alt="b">')).passed,
  true,
);
assert.strictEqual(
  checkAltText(load('<img src="a.jpg"><img src="b.jpg"><img src="c.jpg" alt="c">')).passed,
  false,
);
assert.strictEqual(checkAltText(load("<p>No images</p>")).passed, true);

assert.strictEqual(checkViewport(load('<meta name="viewport" content="width=device-width">')).passed, true);
assert.strictEqual(checkViewport(load("<html></html>")).passed, false);

assert.strictEqual(
  checkAboveFoldCta(load('<body><a href="/contact">Contact us</a><h2>About</h2></body>')).passed,
  true,
);
assert.strictEqual(
  checkAboveFoldCta(load('<body><h2>About</h2><a href="/contact">Contact us</a></body>')).passed,
  false,
);
assert.strictEqual(checkAboveFoldCta(load("<body><p>Nothing here</p></body>")).passed, false);

assert.strictEqual(checkContactMethod(load('<a href="tel:+911234567890">Call</a>')).passed, true);
assert.strictEqual(checkContactMethod(load('<a href="mailto:hi@example.com">Email</a>')).passed, true);
assert.strictEqual(checkContactMethod(load("<form></form>")).passed, true);
assert.strictEqual(checkContactMethod(load("<p>Nothing</p>")).passed, false);

assert.strictEqual(checkSocialLinks(load('<a href="https://facebook.com/us">FB</a>')).passed, true);
assert.strictEqual(checkSocialLinks(load("<p>No links</p>")).passed, false);

assert.strictEqual(checkHttps("https://example.com").passed, true);
assert.strictEqual(checkHttps("http://example.com").passed, false);

console.log("lib/audits/checks.test.ts: all checks passed");
```

- [ ] **Step 4: Run the self-check**

Run: `npx tsx lib/audits/checks.test.ts`
Expected: prints `lib/audits/checks.test.ts: all checks passed` and exits 0.

- [ ] **Step 5: Create `lib/audits/score.ts`**

```ts
import type { CategoryScores, CheckFinding, IssueSeverity } from "@/types/audit";

const SCORED_CATEGORIES = ["seo", "mobile", "conversion"] as const;

// Each scored category starts at 100 and loses its failed checks' points,
// floored at 0. "technical"-category findings (e.g. HTTPS) never affect
// any category score — they're recorded as issues but not scored.
export function computeCategoryScores(findings: CheckFinding[]): CategoryScores {
  const scores: CategoryScores = { seo: 100, mobile: 100, conversion: 100 };
  for (const finding of findings) {
    if (finding.passed) continue;
    if (finding.category !== "seo" && finding.category !== "mobile" && finding.category !== "conversion") continue;
    scores[finding.category] = Math.max(0, scores[finding.category] - finding.points);
  }
  return scores;
}

// Performance is deliberately not part of CategoryScores this phase (no
// headless browser/API — see the design spec) and is never included here;
// Overall is the plain average of seo/mobile/conversion.
export function computeOverallScore(scores: CategoryScores): number {
  const values = SCORED_CATEGORIES.map((category) => scores[category]);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

// Mirrors the point value of the check that produced the issue, so
// severity is never a separate judgment to keep in sync with what
// actually moved the score.
export function severityForPoints(points: number): IssueSeverity {
  if (points >= 30) return "high";
  if (points >= 15) return "medium";
  return "low";
}
```

- [ ] **Step 6: Create the self-check `lib/audits/score.test.ts`**

```ts
import assert from "node:assert";
import { computeCategoryScores, computeOverallScore, severityForPoints } from "./score";
import type { CheckFinding } from "@/types/audit";

function finding(overrides: Partial<CheckFinding> = {}): CheckFinding {
  return {
    category: "seo",
    points: 30,
    passed: false,
    title: "Test",
    description: "Test",
    evidence: null,
    ...overrides,
  };
}

assert.deepStrictEqual(
  computeCategoryScores([
    finding({ category: "seo", passed: true }),
    finding({ category: "mobile", passed: true }),
    finding({ category: "conversion", passed: true }),
  ]),
  { seo: 100, mobile: 100, conversion: 100 },
);

// Multiple failures in one category floor at 0, never negative.
assert.deepStrictEqual(
  computeCategoryScores([
    finding({ category: "seo", points: 30, passed: false }),
    finding({ category: "seo", points: 25, passed: false }),
    finding({ category: "seo", points: 20, passed: false }),
    finding({ category: "seo", points: 25, passed: false }),
  ]),
  { seo: 0, mobile: 100, conversion: 100 },
);

// technical-category findings never affect any scored category.
assert.deepStrictEqual(
  computeCategoryScores([finding({ category: "technical", points: 30, passed: false })]),
  { seo: 100, mobile: 100, conversion: 100 },
);

assert.strictEqual(computeOverallScore({ seo: 90, mobile: 100, conversion: 80 }), 90);
assert.strictEqual(computeOverallScore({ seo: 0, mobile: 0, conversion: 0 }), 0);

assert.strictEqual(severityForPoints(40), "high");
assert.strictEqual(severityForPoints(30), "high");
assert.strictEqual(severityForPoints(25), "medium");
assert.strictEqual(severityForPoints(15), "medium");
assert.strictEqual(severityForPoints(10), "low");

console.log("lib/audits/score.test.ts: all checks passed");
```

- [ ] **Step 7: Run the self-check**

Run: `npx tsx lib/audits/score.test.ts`
Expected: prints `lib/audits/score.test.ts: all checks passed` and exits 0.

- [ ] **Step 8: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json types/audit.ts lib/audits/checks.ts lib/audits/checks.test.ts lib/audits/score.ts lib/audits/score.test.ts
git commit -m "Add audit types, deterministic checks, and scoring"
```

---

### Task 3: Website fetcher

**Files:**
- Create: `lib/audits/fetch-website.ts`

**Interfaces:**
- Consumes: `runAllChecks`, `checkHttps` (Task 2), `CheckFinding` type (Task 2)
- Produces: `FetchResult` interface, `fetchAndCheckWebsite(url: string): Promise<FetchResult>` — consumed by Task 6's Inngest function.

- [ ] **Step 1: Create `lib/audits/fetch-website.ts`**

```ts
import * as cheerio from "cheerio";
import { runAllChecks, checkHttps } from "./checks";
import type { CheckFinding } from "@/types/audit";

const FETCH_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface FetchResult {
  reachable: boolean;
  error: string | null;
  findings: CheckFinding[];
}

function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Not unit-tested (network-dependent, no framework for mocking fetch in
// this codebase) — matches lib/lead-gen/job-store.ts's precedent of no
// self-check for DB/network-touching helpers. Exercised in Task 9's
// manual verification against a real reachable and a real unreachable URL.
export async function fetchAndCheckWebsite(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(withScheme(url), {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return { reachable: false, error: `Site responded with HTTP ${response.status}.`, findings: [] };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return {
        reachable: false,
        error: `Site did not return HTML (content-type: ${contentType || "unknown"}).`,
        findings: [],
      };
    }

    const reader = response.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          break;
        }
        html += decoder.decode(value, { stream: true });
      }
    } else {
      html = await response.text();
    }

    const $ = cheerio.load(html);
    const findings = [...runAllChecks($), checkHttps(response.url || url)];
    return { reachable: true, error: null, findings };
  } catch (err) {
    const reason = controller.signal.aborted
      ? "Request timed out."
      : err instanceof Error
        ? err.message
        : "Unknown error.";
    return { reachable: false, error: `Could not reach the site: ${reason}`, findings: [] };
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 2: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 3: Commit**

```bash
git add lib/audits/fetch-website.ts
git commit -m "Add website fetcher orchestrating checks against a live page"
```

---

### Task 4: AI interpreter provider abstraction (mock only)

**Files:**
- Create: `providers/ai-interpreter/index.ts`
- Create: `providers/ai-interpreter/mock.ts`
- Create: `providers/ai-interpreter/mock.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `AuditEvidence`, `AiInterpretation`, `CheckFinding` types (Task 2)
- Produces: `AiInterpreter` interface, `getAiInterpreter(): AiInterpreter` (`providers/ai-interpreter/index.ts`) — consumed by Task 6's Inngest function.

- [ ] **Step 1: Create `providers/ai-interpreter/index.ts`**

```ts
import type { AiInterpretation, AuditEvidence } from "@/types/audit";
import { mockAiInterpreter } from "./mock";

export interface AiInterpreter {
  interpret(evidence: AuditEvidence): Promise<AiInterpretation>;
}

export function getAiInterpreter(): AiInterpreter {
  const providerName = process.env.AI_INTERPRETER_PROVIDER ?? "mock";
  if (providerName === "mock") return mockAiInterpreter;
  throw new Error(`AI interpreter provider "${providerName}" is not implemented yet. Only "mock" is available.`);
}
```

- [ ] **Step 2: Create `providers/ai-interpreter/mock.ts`**

```ts
import type { AiInterpreter } from "./index";

// Dev/test-only stand-in for a real AI provider (e.g. Anthropic/OpenAI).
// Deliberately NOT a real LLM call: it composes summary/talkingPoints
// purely by combining the evidence it's given, so it's mechanically
// incapable of inventing a finding that isn't in the input — satisfying
// docs/wibsity-sales-build-spec.md §14's "AI should NOT invent technical
// facts" rule by construction rather than by prompting discipline. When a
// real provider is available, only a new file + one factory branch change.

const CATEGORY_LABEL: Record<string, string> = {
  seo: "SEO",
  mobile: "mobile experience",
  conversion: "conversion path",
  technical: "technical setup",
};

export const mockAiInterpreter: AiInterpreter = {
  async interpret(evidence) {
    if (!evidence.reachable) {
      return {
        summary: "The audit could not reliably measure this site because it could not be reached.",
        talkingPoints: [],
      };
    }

    const failed = evidence.findings.filter((finding) => !finding.passed);

    if (failed.length === 0) {
      return {
        summary: "The audit found no significant issues across the checks it ran.",
        talkingPoints: [],
      };
    }

    const byCategory = new Map<string, number>();
    for (const finding of failed) {
      byCategory.set(finding.category, (byCategory.get(finding.category) ?? 0) + 1);
    }

    const categorySummary = Array.from(byCategory.entries())
      .map(([category, count]) => `${count} issue${count > 1 ? "s" : ""} in ${CATEGORY_LABEL[category] ?? category}`)
      .join(", ");

    const summary = `The audit found ${failed.length} issue${failed.length > 1 ? "s" : ""}: ${categorySummary}.`;

    const talkingPoints = failed
      .slice()
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map((finding) => finding.description);

    return { summary, talkingPoints };
  },
};
```

- [ ] **Step 3: Create the self-check `providers/ai-interpreter/mock.test.ts`**

```ts
import assert from "node:assert";
import { mockAiInterpreter } from "./mock";
import type { AuditEvidence, CheckFinding } from "@/types/audit";

function finding(overrides: Partial<CheckFinding> = {}): CheckFinding {
  return {
    category: "seo",
    points: 30,
    passed: false,
    title: "Missing title",
    description: "No <title> tag was found.",
    evidence: null,
    ...overrides,
  };
}

async function main() {
  const unreachable: AuditEvidence = { reachable: false, categoryScores: null, findings: [] };
  const unreachableResult = await mockAiInterpreter.interpret(unreachable);
  assert.ok(unreachableResult.summary.toLowerCase().includes("could not"));
  assert.deepStrictEqual(unreachableResult.talkingPoints, []);

  const clean: AuditEvidence = {
    reachable: true,
    categoryScores: { seo: 100, mobile: 100, conversion: 100 },
    findings: [finding({ passed: true })],
  };
  const cleanResult = await mockAiInterpreter.interpret(clean);
  assert.ok(!cleanResult.summary.toLowerCase().includes("missing title"));

  // Anti-hallucination property: only issues actually present in the
  // evidence are ever mentioned. A passed check's description, and a
  // category never present at all, must never leak into the output.
  const partial: AuditEvidence = {
    reachable: true,
    categoryScores: { seo: 70, mobile: 100, conversion: 100 },
    findings: [
      finding({ category: "seo", title: "Missing title", description: "No <title> tag was found." }),
      finding({
        category: "seo",
        passed: true,
        title: "Meta description",
        description: "Meta description is fine.",
      }),
    ],
  };
  const partialResult = await mockAiInterpreter.interpret(partial);
  assert.ok(partialResult.talkingPoints.some((point) => point.includes("No <title> tag was found.")));
  assert.ok(!partialResult.summary.includes("Meta description is fine."));
  assert.ok(!partialResult.talkingPoints.some((point) => point.toLowerCase().includes("social")));

  console.log("providers/ai-interpreter/mock.test.ts: all checks passed");
}

main();
```

- [ ] **Step 4: Run the self-check**

Run: `npx tsx providers/ai-interpreter/mock.test.ts`
Expected: prints `providers/ai-interpreter/mock.test.ts: all checks passed` and exits 0.

- [ ] **Step 5: Add `AI_INTERPRETER_PROVIDER` to `.env.example`**

Add a new section at the end of `.env.example`:

```bash
# AI interpreter for website audits (Phase 4). Only "mock" is implemented —
# it's a template-based dev/test-only interpreter, not a real LLM call. A
# real provider (Anthropic/OpenAI) can be added later behind the same
# providers/ai-interpreter/index.ts factory.
AI_INTERPRETER_PROVIDER=mock
```

- [ ] **Step 6: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 7: Commit**

```bash
git add providers/ai-interpreter/index.ts providers/ai-interpreter/mock.ts providers/ai-interpreter/mock.test.ts .env.example
git commit -m "Add AI interpreter provider abstraction with mock implementation"
```

---

### Task 5: Audit DB helpers — mutation (job-store) and read (queries)

**Files:**
- Create: `lib/audits/job-store.ts`
- Create: `lib/audits/queries.ts`

**Interfaces:**
- Consumes: `WebsiteAudit`, `AuditIssue`, `CategoryScores`, `CheckFinding` types (Task 2), `severityForPoints` (Task 2)
- Produces: `getAudit`, `markAuditProcessing`, `markAuditCompleted`, `markAuditFailed`, `saveIssues` (`lib/audits/job-store.ts`, used by Task 6's Inngest function and Task 7's server actions); `getLatestAuditForLead`, `getLatestAuditsForOrg`, `getAuditById`, `getIssuesForAudit` (`lib/audits/queries.ts`, used by Task 8's pages).

- [ ] **Step 1: Create `lib/audits/job-store.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryScores, CheckFinding, WebsiteAudit } from "@/types/audit";
import { severityForPoints } from "./score";

export async function getAudit(supabase: SupabaseClient, auditId: string): Promise<WebsiteAudit | null> {
  const { data } = await supabase.from("website_audits").select("*").eq("id", auditId).maybeSingle();
  return data as WebsiteAudit | null;
}

export async function markAuditProcessing(supabase: SupabaseClient, auditId: string): Promise<void> {
  await supabase.from("website_audits").update({ status: "processing" }).eq("id", auditId);
}

export async function markAuditCompleted(
  supabase: SupabaseClient,
  auditId: string,
  scores: CategoryScores | null,
  overallScore: number | null,
  summary: string,
  talkingPoints: string[] = [],
): Promise<void> {
  await supabase
    .from("website_audits")
    .update({
      status: "completed",
      overall_score: overallScore,
      performance_score: null,
      mobile_score: scores?.mobile ?? null,
      seo_score: scores?.seo ?? null,
      conversion_score: scores?.conversion ?? null,
      summary,
      raw_results: { talking_points: talkingPoints },
    })
    .eq("id", auditId);
}

export async function markAuditFailed(supabase: SupabaseClient, auditId: string, errorMessage: string): Promise<void> {
  await supabase.from("website_audits").update({ status: "failed", error: errorMessage }).eq("id", auditId);
}

// Replaces rather than accumulates: an audit is a single atomic
// fetch-and-check, not a resumable multi-item loop (contrast with Phase
// 3's generation_results, where already-resolved rows are never touched
// again). Deleting first means a re-run (Retry, or any resend) always
// leaves audit_issues matching exactly what that run found — never a
// duplicated pile from an earlier attempt.
export async function saveIssues(supabase: SupabaseClient, auditId: string, findings: CheckFinding[]): Promise<void> {
  await supabase.from("audit_issues").delete().eq("audit_id", auditId);

  const failed = findings.filter((finding) => !finding.passed);
  if (failed.length === 0) return;

  await supabase.from("audit_issues").insert(
    failed.map((finding) => ({
      audit_id: auditId,
      category: finding.category,
      severity: severityForPoints(finding.points),
      title: finding.title,
      description: finding.description,
      evidence: finding.evidence,
    })),
  );
}
```

- [ ] **Step 2: Create `lib/audits/queries.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditIssue, WebsiteAudit } from "@/types/audit";

export interface AuditWithLead extends WebsiteAudit {
  lead: { id: string; business_name: string };
}

export async function getLatestAuditForLead(supabase: SupabaseClient, leadId: string): Promise<WebsiteAudit | null> {
  const { data } = await supabase
    .from("website_audits")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as WebsiteAudit | null;
}

// PostgREST doesn't expose SQL's DISTINCT ON, so this fetches every audit
// for the org's leads (newest first) and keeps only the first row seen per
// lead_id in application code — simplest thing that produces "latest audit
// per lead" without a raw-SQL view.
export async function getLatestAuditsForOrg(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<AuditWithLead[]> {
  const { data } = await supabase
    .from("website_audits")
    .select("*, lead:leads!inner(id, business_name, organization_id)")
    .eq("lead.organization_id", organizationId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as AuditWithLead[];
  const seen = new Set<string>();
  const latest: AuditWithLead[] = [];
  for (const row of rows) {
    if (seen.has(row.lead_id)) continue;
    seen.add(row.lead_id);
    latest.push(row);
  }
  return latest;
}

export async function getAuditById(supabase: SupabaseClient, auditId: string): Promise<AuditWithLead | null> {
  const { data } = await supabase
    .from("website_audits")
    .select("*, lead:leads(id, business_name)")
    .eq("id", auditId)
    .maybeSingle();
  return data as unknown as AuditWithLead | null;
}

export async function getIssuesForAudit(supabase: SupabaseClient, auditId: string): Promise<AuditIssue[]> {
  const { data } = await supabase
    .from("audit_issues")
    .select("*")
    .eq("audit_id", auditId)
    .order("created_at", { ascending: true });
  return (data ?? []) as AuditIssue[];
}
```

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 4: Commit**

```bash
git add lib/audits/job-store.ts lib/audits/queries.ts
git commit -m "Add audit DB helpers for the job lifecycle and page reads"
```

---

### Task 6: The Inngest function

**Files:**
- Create: `lib/inngest/functions/audit-website.ts`
- Modify: `app/api/inngest/route.ts` (add to the existing `functions` array)

**Interfaces:**
- Consumes: `inngest` (existing `lib/inngest/client.ts`), `createAdminClient` (existing `lib/supabase/admin.ts`), `createActivity` (existing `lib/crm/activities.ts`), `fetchAndCheckWebsite` (Task 3), `computeCategoryScores`/`computeOverallScore` (Task 2), `getAiInterpreter` (Task 4), `getAudit`/`markAuditProcessing`/`markAuditCompleted`/`markAuditFailed`/`saveIssues` (Task 5)
- Produces: `auditWebsite` (the Inngest function) — registered in `app/api/inngest/route.ts`, triggered by event `audits/website.requested` with payload `{ auditId: string }` (sent by Task 7's server actions).

- [ ] **Step 1: Create `lib/inngest/functions/audit-website.ts`**

```ts
import { NonRetriableError } from "inngest";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createActivity } from "@/lib/crm/activities";
import { fetchAndCheckWebsite } from "@/lib/audits/fetch-website";
import { computeCategoryScores, computeOverallScore } from "@/lib/audits/score";
import { getAiInterpreter } from "@/providers/ai-interpreter";
import { getAudit, markAuditProcessing, markAuditCompleted, markAuditFailed, saveIssues } from "@/lib/audits/job-store";

export const auditWebsite = inngest.createFunction(
  {
    id: "audit-website",
    triggers: { event: "audits/website.requested" },
    // No event-level idempotency key — see lib/inngest/functions/generate-leads.ts's
    // comment for why: a legitimate retry resends this same auditId, and
    // Inngest's idempotency dedup would silently drop that resend.
    onFailure: async ({ event, error }) => {
      const auditId = (event.data.event.data as { auditId: string }).auditId;
      const supabase = createAdminClient();
      await markAuditFailed(supabase, auditId, error.message);
    },
  },
  async ({ event, step }) => {
    const { auditId } = event.data as { auditId: string };
    const supabase = createAdminClient();

    const audit = await step.run("load-audit", () => getAudit(supabase, auditId));
    if (!audit) throw new NonRetriableError(`website_audits row ${auditId} not found`);

    const lead = await step.run("load-lead", async () => {
      const { data } = await supabase.from("leads").select("id, website").eq("id", audit.lead_id).maybeSingle();
      return data as { id: string; website: string | null } | null;
    });
    if (!lead?.website) throw new NonRetriableError(`Lead ${audit.lead_id} has no website to audit`);

    await step.run("mark-processing", () => markAuditProcessing(supabase, auditId));

    const fetchResult = await step.run("fetch-and-check", () => fetchAndCheckWebsite(lead.website!));

    if (!fetchResult.reachable) {
      await step.run("save-unreachable", async () => {
        await saveIssues(supabase, auditId, []);
        await markAuditCompleted(supabase, auditId, null, null, fetchResult.error ?? "The site could not be reached.");
      });
      await step.run("log-activity", () => createActivity(supabase, audit.lead_id, "audited", "Website audited"));
      return { reachable: false };
    }

    const scores = await step.run("compute-scores", () => computeCategoryScores(fetchResult.findings));
    const overall = await step.run("compute-overall", () => computeOverallScore(scores));

    const interpretation = await step.run("interpret", () => {
      const interpreter = getAiInterpreter();
      return interpreter.interpret({ reachable: true, categoryScores: scores, findings: fetchResult.findings });
    });

    await step.run("save-issues", () => saveIssues(supabase, auditId, fetchResult.findings));
    await step.run("mark-completed", () =>
      markAuditCompleted(supabase, auditId, scores, overall, interpretation.summary, interpretation.talkingPoints),
    );
    await step.run("log-activity", () => createActivity(supabase, audit.lead_id, "audited", "Website audited"));

    return { reachable: true, overall };
  },
);
```

- [ ] **Step 2: Register the function in `app/api/inngest/route.ts`**

Read the current file first — it already registers `generateLeads` from Phase 3. Add the import and append to the array; do not remove the existing registration:

```ts
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { generateLeads } from "@/lib/inngest/functions/generate-leads";
import { auditWebsite } from "@/lib/inngest/functions/audit-website";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateLeads, auditWebsite],
});
```

- [ ] **Step 3: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean. (This checks types/wiring only — the pipeline can't be exercised end-to-end until Task 7's server action can trigger it; that happens in Task 9's manual verification.)

- [ ] **Step 4: Commit**

```bash
git add lib/inngest/functions/audit-website.ts app/api/inngest/route.ts
git commit -m "Add the audit-website Inngest function"
```

---

### Task 7: Server actions — run and retry

**Files:**
- Modify: `app/(dashboard)/leads/[id]/actions.ts` (add to the existing file; it already exports `markContactedAction`/`addNoteAction`/`rescheduleFollowUpAction`/`clearFollowUpAction` — keep those)

**Interfaces:**
- Consumes: `inngest` (existing `lib/inngest/client.ts`)
- Produces: `runAuditAction(leadId: string): Promise<void>`, `retryAuditAction(auditId: string, leadId: string): Promise<void>` — consumed by Task 8's `AuditCard`.

- [ ] **Step 1: Add the two actions to `app/(dashboard)/leads/[id]/actions.ts`**

Read the current file first (it has four existing exports and these imports: `revalidatePath` from `"next/cache"`, `createClient` from `"@/lib/supabase/server"`, plus CRM helpers). Add one new import and two new exported functions at the end of the file — do not change the existing four:

```ts
import { inngest } from "@/lib/inngest/client";
```

```ts
export async function runAuditAction(leadId: string) {
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("id, website").eq("id", leadId).maybeSingle();
  if (!lead?.website) return;

  const { data: audit, error } = await supabase
    .from("website_audits")
    .insert({ lead_id: leadId, status: "pending" })
    .select("id")
    .single();
  if (error || !audit) return;

  await inngest.send({ name: "audits/website.requested", data: { auditId: audit.id } });
  revalidatePath(`/leads/${leadId}`);
}

export async function retryAuditAction(auditId: string, leadId: string) {
  const supabase = await createClient();
  const { data: audit } = await supabase
    .from("website_audits")
    .select("id, status")
    .eq("id", auditId)
    .maybeSingle();
  if (!audit || audit.status !== "failed") return;

  await supabase.from("website_audits").update({ status: "pending", error: null }).eq("id", auditId);
  await inngest.send({ name: "audits/website.requested", data: { auditId } });
  revalidatePath(`/leads/${leadId}`);
}
```

Both rely on RLS (via the session-bound `createClient()`) for org-scoping, same as the file's existing actions — `website_audits` has no direct `organization_id` column to filter by explicitly (unlike Phase 3's `generation_jobs`), only the `leads` join RLS already enforces.

- [ ] **Step 2: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/leads/[id]/actions.ts"
git commit -m "Add run and retry server actions for website audits"
```

---

### Task 8: UI — audit card on the lead, `/audits` list, `/audits/[id]` detail

**Files:**
- Create: `components/leads/audit-card.tsx`
- Modify: `app/(dashboard)/leads/[id]/page.tsx` (render `AuditCard`)
- Modify: `app/(dashboard)/audits/page.tsx` (replace the Phase-1 empty-state stub)
- Modify: `app/(dashboard)/audits/[id]/page.tsx` (replace the Phase-1 empty-state stub)

**Interfaces:**
- Consumes: `runAuditAction`/`retryAuditAction` (Task 7), `getLatestAuditForLead`/`getLatestAuditsForOrg`/`getAuditById`/`getIssuesForAudit` (Task 5), `WebsiteAudit`/`AuditIssue` types (Task 2)
- Produces: `AuditCard` component.

- [ ] **Step 1: Create `components/leads/audit-card.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { runAuditAction, retryAuditAction } from "@/app/(dashboard)/leads/[id]/actions";
import { Button } from "@/components/ui/button";
import type { WebsiteAudit } from "@/types/audit";

const POLL_INTERVAL_MS = 1500;

function ScoreRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value ?? "Not measured"}</span>
    </div>
  );
}

export function AuditCard({
  leadId,
  website,
  audit,
}: {
  leadId: string;
  website: string | null;
  audit: WebsiteAudit | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const inProgress = audit?.status === "pending" || audit?.status === "processing";

  useEffect(() => {
    if (!audit || !inProgress) return;
    const supabase = createClient();
    let stopped = false;

    async function poll() {
      const { data } = await supabase.from("website_audits").select("status").eq("id", audit!.id).maybeSingle();
      if (stopped || !data) return;
      if (data.status !== "pending" && data.status !== "processing") {
        stopped = true;
        clearInterval(interval);
        router.refresh();
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [audit, inProgress, router]);

  if (!website) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">WEBSITE AUDIT</h2>
        {audit && audit.status === "completed" && (
          <Link href={`/audits/${audit.id}`} className="text-sm text-primary hover:underline">
            View full audit
          </Link>
        )}
      </div>

      {!audit && (
        <form action={() => startTransition(() => runAuditAction(leadId))}>
          <Button type="submit" size="sm" disabled={isPending}>
            Run audit
          </Button>
        </form>
      )}

      {audit && inProgress && <p className="text-sm text-muted-foreground">Auditing website...</p>}

      {audit && audit.status === "failed" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-destructive">{audit.error ?? "Website audit failed."}</p>
          <form action={() => startTransition(() => retryAuditAction(audit.id, leadId))}>
            <Button type="submit" size="sm" disabled={isPending}>
              Retry
            </Button>
          </form>
        </div>
      )}

      {audit && audit.status === "completed" && (
        <>
          <div className="flex flex-col gap-1.5">
            <ScoreRow label="Overall" value={audit.overall_score} />
            <ScoreRow label="Performance" value={audit.performance_score} />
            <ScoreRow label="Mobile UX" value={audit.mobile_score} />
            <ScoreRow label="SEO" value={audit.seo_score} />
            <ScoreRow label="Conversion" value={audit.conversion_score} />
          </div>
          <p className="text-sm text-foreground">{audit.summary}</p>
          <form action={() => startTransition(() => runAuditAction(leadId))}>
            <Button type="submit" variant="outline" size="sm" disabled={isPending}>
              Re-run audit
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire `AuditCard` into `app/(dashboard)/leads/[id]/page.tsx`**

Read the current file first. Add the import and the `getLatestAuditForLead` call, and render `AuditCard` between `ContactInfoCard` and `FollowUpCard`:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLeadById, getNotesForLead } from "@/lib/crm/leads";
import { getActivitiesForLead } from "@/lib/crm/activities";
import { getLatestAuditForLead } from "@/lib/audits/queries";
import { LeadDetailHeader } from "@/components/leads/lead-detail-header";
import { ContactInfoCard } from "@/components/leads/contact-info-card";
import { AuditCard } from "@/components/leads/audit-card";
import { LeadNotes } from "@/components/leads/lead-notes";
import { ActivityTimeline } from "@/components/leads/activity-timeline";
import { FollowUpCard } from "@/components/leads/follow-up-card";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user!.id)
    .single();

  const lead = await getLeadById(supabase, profile!.organization_id, id);
  if (!lead) notFound();

  const notes = await getNotesForLead(supabase, lead.id);
  const activities = await getActivitiesForLead(supabase, lead.id);
  const audit = await getLatestAuditForLead(supabase, lead.id);

  return (
    <>
      <LeadDetailHeader lead={lead} />
      <ContactInfoCard lead={lead} />
      <AuditCard leadId={lead.id} website={lead.website} audit={audit} />
      <FollowUpCard leadId={lead.id} nextFollowupAt={lead.next_followup_at} />
      <LeadNotes leadId={lead.id} notes={notes} />
      <ActivityTimeline activities={activities} />
    </>
  );
}
```

- [ ] **Step 3: Replace `app/(dashboard)/audits/page.tsx`**

```tsx
import Link from "next/link";
import { SearchCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLatestAuditsForOrg } from "@/lib/audits/queries";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function statusLabel(status: string): string {
  if (status === "completed") return "Complete";
  if (status === "failed") return "Failed";
  return "In progress";
}

export default async function AuditsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user!.id)
    .single();

  const audits = await getLatestAuditsForOrg(supabase, profile!.organization_id);

  return (
    <>
      <PageHeader title="Audits" description="Website audits generated for every analyzed lead." />
      {audits.length === 0 ? (
        <EmptyState
          icon={SearchCheck}
          title="No audits yet"
          description="Run an audit from a lead's detail page to see it here."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Business</th>
                <th className="px-4 py-2 font-medium">Overall</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {audits.map((audit) => (
                <tr key={audit.id} className="hover:bg-accent">
                  <td className="px-4 py-2">
                    <Link href={`/audits/${audit.id}`} className="font-medium text-foreground hover:underline">
                      {audit.lead.business_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{audit.overall_score ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground">{formatDate(audit.created_at)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{statusLabel(audit.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Replace `app/(dashboard)/audits/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuditById, getIssuesForAudit } from "@/lib/audits/queries";
import { PageHeader } from "@/components/page-header";
import type { AuditCategory, AuditIssue } from "@/types/audit";

function ScoreRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value ?? "Not measured"}</span>
    </div>
  );
}

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  seo: "SEO",
  mobile: "Mobile",
  conversion: "Conversion",
  technical: "Technical",
};

function groupByCategory(issues: AuditIssue[]): [AuditCategory, AuditIssue[]][] {
  const groups = new Map<AuditCategory, AuditIssue[]>();
  for (const issue of issues) {
    const list = groups.get(issue.category) ?? [];
    list.push(issue);
    groups.set(issue.category, list);
  }
  return Array.from(groups.entries());
}

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const audit = await getAuditById(supabase, id);
  if (!audit) notFound();

  const issues = await getIssuesForAudit(supabase, id);
  const talkingPoints = (audit.raw_results as { talking_points?: string[] } | null)?.talking_points ?? [];

  return (
    <>
      <PageHeader
        title={audit.lead.business_name}
        description="Website audit scores, findings, and recommendations."
        actions={
          <Link href={`/leads/${audit.lead.id}`} className="text-sm text-primary hover:underline">
            View lead
          </Link>
        }
      />

      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium text-muted-foreground">SCORES</h2>
        <ScoreRow label="Overall" value={audit.overall_score} />
        <ScoreRow label="Performance" value={audit.performance_score} />
        <ScoreRow label="Mobile UX" value={audit.mobile_score} />
        <ScoreRow label="SEO" value={audit.seo_score} />
        <ScoreRow label="Conversion" value={audit.conversion_score} />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium text-muted-foreground">AI SUMMARY</h2>
        <p className="text-sm text-foreground">{audit.summary}</p>
      </div>

      {talkingPoints.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium text-muted-foreground">CALL TALKING POINTS</h2>
          <ul className="list-disc pl-5 text-sm text-foreground">
            {talkingPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium text-muted-foreground">TECHNICAL FINDINGS</h2>
        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No issues were found.</p>
        ) : (
          groupByCategory(issues).map(([category, categoryIssues]) => (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                {CATEGORY_LABEL[category] ?? category}
              </h3>
              <ul className="flex flex-col gap-3">
                {categoryIssues.map((issue) => (
                  <li key={issue.id} className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">{issue.title}</span>
                    <span className="text-sm text-muted-foreground">{issue.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

Then run `npm run dev`, sign in with the seeded operator, and visit a lead with a `website` set (e.g. one of the seeded leads under `/leads`). Confirm the "WEBSITE AUDIT" card renders with a "Run audit" button, and that visiting `/audits` shows the empty state (no audits have run yet).

- [ ] **Step 6: Commit**

```bash
git add components/leads/audit-card.tsx "app/(dashboard)/leads/[id]/page.tsx" "app/(dashboard)/audits/page.tsx" "app/(dashboard)/audits/[id]/page.tsx"
git commit -m "Add audit UI: lead detail card, audits list, and audit detail page"
```

---

### Task 9: End-to-end manual verification and README update

This task has no new source files — it's the manual verification pass, since the fetch/Inngest/AI pipeline needs the real Inngest dev server and a live Supabase project to observe, not a unit test.

**Files:**
- Modify: `README.md` (`/audits` status row)

- [ ] **Step 1: Start both dev processes**

Run in one terminal: `npm run dev`
Run in another terminal: `npx inngest-cli dev`

Expected: the Inngest dev server's Apps page shows `audit-website` (alongside `generate-leads`) registered under the `wibsity-sales` app.

- [ ] **Step 2: Verify a normal audit against a real reachable site**

Pick or edit a seeded lead so its `website` is a real, reachable URL you control or trust (e.g. a well-known site). From that lead's detail page, click "Run audit". Confirm:
- The card shows "Auditing website..." then resolves to a completed state without a manual page reload.
- Scores are populated for Overall/Mobile UX/SEO/Conversion (0-100), and Performance always shows "Not measured".
- Visiting `/audits` shows this lead with the same Overall score and "Complete" status.
- Clicking through to `/audits/[id]` shows the AI summary, technical findings grouped by category, and (if any issues exist) call talking points — and confirm every sentence in the summary/talking points traces back to an issue actually listed below it, not something invented.
- The lead's activity timeline (`/leads/[id]`) shows a "Website audited" entry.

- [ ] **Step 3: Verify the unreachable-site path**

Set a different lead's `website` to a domain that doesn't resolve (e.g. `https://this-domain-does-not-exist-12345.example`). Run an audit. Confirm:
- The audit reaches `status: 'completed'` (not `failed` — an unreachable site is itself a finding, not a pipeline error), with all scores `null`/"Not measured" and a summary stating the site couldn't be reached.
- No crash, no fabricated score.

- [ ] **Step 4: Verify Retry on a genuine pipeline failure**

Temporarily set `AI_INTERPRETER_PROVIDER=not-a-real-provider` in `.env.local`, restart `npm run dev`, run an audit against a reachable site — it should reach `status: 'failed'` (the provider factory throws, same pattern as Phase 3's forced-failure test). Set `AI_INTERPRETER_PROVIDER` back to `mock` (or remove the line), restart, then click Retry on the failed audit. Confirm it resumes and completes successfully, and that `audit_issues` for that audit contains exactly one set of findings (no duplicates from the failed attempt — confirms the delete-then-insert behavior in `saveIssues`).

- [ ] **Step 5: Update README**

In `README.md`, in the "Run the database migrations" list, confirm the `0005_website_audit_status.sql` bullet from Task 1 is present (it should already be there).

Update the "What's real vs. a Phase 1 stub" table's `/audits` row:

```markdown
| `/audits`, `/audits/[id]` | Real: fetch + deterministic checks + AI summary (mock interpreter), mobile-only heuristic, no performance metrics (Phase 4) |
```

- [ ] **Step 6: Final verification**

Run: `npm run build && npm run lint`
Run: `npx tsx lib/audits/checks.test.ts && npx tsx lib/audits/score.test.ts && npx tsx providers/ai-interpreter/mock.test.ts`
Expected: everything passes clean.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "Verify Phase 4 audit pipeline end-to-end and update README status"
```

---

## Self-Review Notes

- **Spec coverage:** website fetcher + deterministic checks (§14, Task 2-3) ✓; audit creation as an async job (§Background jobs pattern reused, Task 6) ✓; AI interpretation without invented facts (§14, Task 4, tested directly) ✓; audit UI on the lead + `/audits` + `/audits/[id]` (§11, §13, Task 8) ✓; scoring rubric and severity (design spec, Task 2) ✓.
- **Out of scope confirmed absent from tasks:** no lead-scoring formula or `leads.score` changes, no performance/headless-browser check, no broken-link crawl, no real AI provider/key, no auto-trigger on lead creation, no `react-hook-form` usage, no new RLS policies.
- **Consistency check:** event name `audits/website.requested` matches between Task 6 (function trigger) and Task 7 (server actions' `inngest.send`); `WebsiteAudit`/`AuditIssue`/`CheckFinding`/`CategoryScores` field names are identical everywhere they're read or written (Tasks 2, 5, 6, 8); `markAuditCompleted`'s signature (including the `talkingPoints` parameter added for the `raw_results` column) matches its one call site in Task 6.
