# Lead Scoring Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every lead a real, deterministic 0–100 score (`leads.score`/`score_category`) computed from data already in this codebase — five independent, explainable factors, no AI, normalized to 100 even when the website-opportunity factor is genuinely unassessed — with a breakdown shown on the lead detail page.

**Architecture:** A pure, synchronous scoring function (`calculateScore`) takes a plain input object and returns a per-factor breakdown plus the overall score/category — no network, no database, fully unit-tested. A thin DB layer (`computeAndStoreScore`) loads a lead's current inputs (its own fields, its latest *completed* audit's score, whether it has a named contact), calls the pure function, and writes the result onto the existing `leads.score`/`score_category` columns. It's called from the two existing write paths that change scoring inputs (lead creation, audit completion) and from a manual "Recalculate" button. The lead detail page recomputes the breakdown live at render time using the same pure function, so the display can never drift from what the current data actually says.

**Tech Stack:** TypeScript, Supabase (`@supabase/supabase-js`) — no new dependencies, no new environment variables, no new database migration (`leads.score`/`score_category` already exist).

**Spec:** `docs/wibsity-sales-build-spec.md` §15, `docs/superpowers/specs/2026-09-13-lead-scoring-design.md`

## Global Constraints

- No AI anywhere in the numeric calculation — `calculateScore` is a plain, deterministic function of its input.
- The website-opportunity factor is `null` ("not yet assessed"), never `0`, when there's no completed audit — and `null` factors are excluded from both the earned-points sum and the max-points denominator, so the overall score stays meaningfully normalized to 0–100 either way (out of 100 when audited, out of 70 when not).
- `TARGET_INDUSTRIES`/`TARGET_SERVICE_AREAS` live in exactly one file (`lib/scoring/config.ts`) — no factor calculator hardcodes an industry or city name inline.
- The "other useful signals" factor is fixed at `{ points: 0, maxPoints: 5 }` — do not invent a signal to make it non-zero.
- Matches against the target lists are case-insensitive **exact** string comparisons, not substring checks (a lesson from Phase 4: substring matching silently false-positives).
- Follow existing codebase conventions exactly:
  - `lib/*/*.ts`-style DB functions: `async function name(supabase: SupabaseClient, ...ids, ...args)`.
  - Self-checks are plain `assert`-based `*.test.ts` files run via `npx tsx <path>` — only the pure `calculateScore` function gets one; the DB-touching `apply-score.ts` does not (matches `lib/lead-gen/job-store.ts` and `lib/audits/job-store.ts`, neither of which has a test).
  - Client components trigger server actions via `startTransition` + a plain `<form action={...}>` (see `components/leads/audit-card.tsx`), not `react-hook-form`.
  - Page components fetch `organization_id` via `supabase.auth.getUser()` then `.from("users").select("organization_id").eq("id", user.id).single()`.
- RLS already fully covers `leads`, `website_audits`, and `lead_contacts` — no RLS changes needed. `computeAndStoreScore` must accept whatever `SupabaseClient` its caller passes (the session-scoped client from `recalculateScoreAction`, or the service-role `createAdminClient()` from the Inngest function) and do no org-scoping of its own — RLS handles the session-client case, and the Inngest function already validated the lead/audit relationship before calling it.
- Verified after every task: `npm run build` and `npm run lint` both pass clean (zero errors, zero warnings); any self-check test in that task passes via `npx tsx`.

---

### Task 1: Types, config, and the pure scoring engine

**Files:**
- Create: `types/scoring.ts`
- Create: `lib/scoring/config.ts`
- Create: `lib/scoring/calculate-score.ts`
- Create: `lib/scoring/calculate-score.test.ts`

**Interfaces:**
- Produces: `ScoreFactor`, `ScoreBreakdown`, `ScoreInput` types (`types/scoring.ts`); `TARGET_INDUSTRIES: string[]`, `TARGET_SERVICE_AREAS: string[]` (`lib/scoring/config.ts`); `calculateScore(input: ScoreInput): ScoreBreakdown` (`lib/scoring/calculate-score.ts`) — consumed by Task 2 (`apply-score.ts`) and Task 3 (the lead detail page).

- [ ] **Step 1: Create `types/scoring.ts`**

```ts
export interface ScoreFactor {
  points: number;
  maxPoints: number;
}

export interface ScoreBreakdown {
  websiteOpportunity: ScoreFactor | null;
  businessActivity: ScoreFactor;
  wibsityFit: ScoreFactor;
  contactability: ScoreFactor;
  localRelevance: ScoreFactor;
  other: ScoreFactor;
  overallScore: number;
  scoreCategory: "HOT" | "WARM" | "LOW" | "SKIP";
}

export interface ScoreInput {
  rating: number | null;
  reviewCount: number | null;
  industry: string | null;
  phone: string | null;
  email: string | null;
  hasContact: boolean;
  city: string | null;
  // undefined = no completed audit exists at all; null = a completed audit
  // exists but the site was unreachable. Both mean "no real signal" and
  // are treated identically by calculateScore.
  websiteAuditScore: number | null | undefined;
}
```

- [ ] **Step 2: Create `lib/scoring/config.ts`**

```ts
// The only place wibsity's target industries and service areas are named —
// expanding the target market later is a one-file edit, not a hunt through
// scoring logic. Defaults derived from this project's seed/demo data.
export const TARGET_INDUSTRIES = ["Solar", "Roofers"];
export const TARGET_SERVICE_AREAS = ["Noida", "Delhi", "Gurugram", "Faridabad", "Ghaziabad", "Meerut"];
```

- [ ] **Step 3: Create `lib/scoring/calculate-score.ts`**

```ts
import type { ScoreBreakdown, ScoreFactor, ScoreInput } from "@/types/scoring";
import { TARGET_INDUSTRIES, TARGET_SERVICE_AREAS } from "./config";

function matchesTarget(value: string, targets: string[]): boolean {
  return targets.some((target) => target.toLowerCase() === value.toLowerCase());
}

// Inverted: a worse audit score means more room for wibsity to help. null
// means "no real signal" (no completed audit, or the site was unreachable)
// — a genuinely different state from "0 opportunity", so it's never
// silently scored as zero.
function calculateWebsiteOpportunity(auditScore: number | null | undefined): ScoreFactor | null {
  if (auditScore == null) return null;
  return { points: Math.round((100 - auditScore) * 0.3), maxPoints: 30 };
}

function reviewCountBand(reviewCount: number): number {
  if (reviewCount >= 100) return 8;
  if (reviewCount >= 50) return 6;
  if (reviewCount >= 10) return 4;
  if (reviewCount >= 1) return 2;
  return 0;
}

// Unlike the website factor, a missing rating/review count here is itself a
// real signal (no reviews = low activity), not an unassessed state — this
// factor always resolves to a number, never null.
function calculateBusinessActivity(rating: number | null, reviewCount: number | null): ScoreFactor {
  const ratingPoints = Math.min(12, Math.max(0, Math.round(((rating ?? 0) / 5) * 12)));
  const reviewCountPoints = reviewCountBand(reviewCount ?? 0);
  return { points: ratingPoints + reviewCountPoints, maxPoints: 20 };
}

function calculateWibsityFit(industry: string | null): ScoreFactor {
  if (!industry) return { points: 0, maxPoints: 20 };
  return { points: matchesTarget(industry, TARGET_INDUSTRIES) ? 20 : 8, maxPoints: 20 };
}

// website is deliberately not counted here — its condition is already fully
// covered by websiteOpportunity, and counting it again would double-weight
// the same signal under a label it doesn't really belong to.
function calculateContactability(phone: string | null, email: string | null, hasContact: boolean): ScoreFactor {
  const points = (phone ? 6 : 0) + (email ? 6 : 0) + (hasContact ? 3 : 0);
  return { points, maxPoints: 15 };
}

function calculateLocalRelevance(city: string | null): ScoreFactor {
  if (!city) return { points: 0, maxPoints: 10 };
  return { points: matchesTarget(city, TARGET_SERVICE_AREAS) ? 10 : 3, maxPoints: 10 };
}

function categoryForScore(score: number): ScoreBreakdown["scoreCategory"] {
  if (score >= 80) return "HOT";
  if (score >= 60) return "WARM";
  if (score >= 40) return "LOW";
  return "SKIP";
}

export function calculateScore(input: ScoreInput): ScoreBreakdown {
  const websiteOpportunity = calculateWebsiteOpportunity(input.websiteAuditScore);
  const businessActivity = calculateBusinessActivity(input.rating, input.reviewCount);
  const wibsityFit = calculateWibsityFit(input.industry);
  const contactability = calculateContactability(input.phone, input.email, input.hasContact);
  const localRelevance = calculateLocalRelevance(input.city);
  const other: ScoreFactor = { points: 0, maxPoints: 5 };

  const knownFactors: ScoreFactor[] = [businessActivity, wibsityFit, contactability, localRelevance, other];
  if (websiteOpportunity) knownFactors.push(websiteOpportunity);

  const earnedPoints = knownFactors.reduce((sum, factor) => sum + factor.points, 0);
  const possiblePoints = knownFactors.reduce((sum, factor) => sum + factor.maxPoints, 0);
  const overallScore = Math.round((earnedPoints / possiblePoints) * 100);

  return {
    websiteOpportunity,
    businessActivity,
    wibsityFit,
    contactability,
    localRelevance,
    other,
    overallScore,
    scoreCategory: categoryForScore(overallScore),
  };
}
```

- [ ] **Step 4: Create the self-check `lib/scoring/calculate-score.test.ts`**

```ts
import assert from "node:assert";
import { calculateScore } from "./calculate-score";
import type { ScoreInput } from "@/types/scoring";

function input(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    rating: null,
    reviewCount: null,
    industry: null,
    phone: null,
    email: null,
    hasContact: false,
    city: null,
    websiteAuditScore: undefined,
    ...overrides,
  };
}

// Missing completed audit -> websiteOpportunity is null, not 0; overall
// score is computed out of the remaining 70 possible points.
{
  const result = calculateScore(input({ websiteAuditScore: undefined }));
  assert.strictEqual(result.websiteOpportunity, null);
  // businessActivity 0 + wibsityFit 0 + contactability 0 + localRelevance 0 + other 0 = 0/70
  assert.strictEqual(result.overallScore, 0);
}

// Audit completed but site unreachable (overall_score null) -> same
// null/"not yet assessed" treatment as no audit at all.
{
  const result = calculateScore(input({ websiteAuditScore: null }));
  assert.strictEqual(result.websiteOpportunity, null);
}

// A completed, measured audit -> websiteOpportunity is a real factor,
// inverted from the audit score, and included in a /100 total.
{
  const result = calculateScore(
    input({ websiteAuditScore: 40, rating: 5, reviewCount: 100, industry: "Solar", phone: "1", email: "a@b.com", hasContact: true, city: "Noida" }),
  );
  assert.deepStrictEqual(result.websiteOpportunity, { points: 18, maxPoints: 30 }); // round((100-40)*0.3) = 18
  assert.strictEqual(result.businessActivity.points, 20); // 12 (rating) + 8 (100+ reviews)
  assert.strictEqual(result.wibsityFit.points, 20); // exact target-industry match
  assert.strictEqual(result.contactability.points, 15); // phone + email + contact
  assert.strictEqual(result.localRelevance.points, 10); // target service area
  assert.strictEqual(result.other.points, 0);
  // earnedPoints = 18+20+20+15+10+0 = 83, possiblePoints = 30+20+20+15+10+5 = 100
  assert.strictEqual(result.overallScore, 83);
}

// Missing contact info -> contactability is 0, not partially credited.
{
  const result = calculateScore(input({ phone: null, email: null, hasContact: false }));
  assert.strictEqual(result.contactability.points, 0);
}

// Unknown/unlisted industry gets partial credit; no industry at all gets none.
{
  assert.strictEqual(calculateScore(input({ industry: "Bakery" })).wibsityFit.points, 8);
  assert.strictEqual(calculateScore(input({ industry: null })).wibsityFit.points, 0);
  assert.strictEqual(calculateScore(input({ industry: "Solar" })).wibsityFit.points, 20);
  assert.strictEqual(calculateScore(input({ industry: "solar" })).wibsityFit.points, 20); // case-insensitive
  assert.strictEqual(calculateScore(input({ industry: "Solar companies" })).wibsityFit.points, 8); // not an exact match
}

// Rating/review-count banding.
{
  assert.strictEqual(calculateScore(input({ rating: 5, reviewCount: 0 })).businessActivity.points, 12);
  assert.strictEqual(calculateScore(input({ rating: 0, reviewCount: 150 })).businessActivity.points, 8);
  assert.strictEqual(calculateScore(input({ rating: 2.5, reviewCount: 25 })).businessActivity.points, 6 + 4); // round(2.5/5*12)=6, band(25)=4
  assert.strictEqual(calculateScore(input({ rating: null, reviewCount: null })).businessActivity.points, 0);
}

// Target vs. non-target service area.
{
  assert.strictEqual(calculateScore(input({ city: "Noida" })).localRelevance.points, 10);
  assert.strictEqual(calculateScore(input({ city: "noida" })).localRelevance.points, 10); // case-insensitive
  assert.strictEqual(calculateScore(input({ city: "Mumbai" })).localRelevance.points, 3);
  assert.strictEqual(calculateScore(input({ city: null })).localRelevance.points, 0);
}

// Category boundaries.
{
  assert.strictEqual(calculateScore(input()).scoreCategory, "SKIP"); // 0/70
}

console.log("lib/scoring/calculate-score.test.ts: all checks passed");
```

- [ ] **Step 5: Run the self-check**

Run: `npx tsx lib/scoring/calculate-score.test.ts`
Expected: prints `lib/scoring/calculate-score.test.ts: all checks passed` and exits 0.

- [ ] **Step 6: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 7: Commit**

```bash
git add types/scoring.ts lib/scoring/config.ts lib/scoring/calculate-score.ts lib/scoring/calculate-score.test.ts
git commit -m "Add deterministic lead-scoring engine with per-factor breakdown"
```

---

### Task 2: DB apply layer, wired into both trigger points

**Files:**
- Create: `lib/scoring/apply-score.ts`
- Modify: `lib/lead-gen/create-lead.ts` (call the trigger after a lead is created)
- Modify: `lib/inngest/functions/audit-website.ts` (call the trigger after an audit completes, both branches)

**Interfaces:**
- Consumes: `calculateScore` (Task 1), `ScoreInput` (Task 1)
- Produces: `loadScoreInput(supabase: SupabaseClient, lead: { id: string; rating: number | null; review_count: number | null; industry: string | null; phone: string | null; email: string | null; city: string | null }): Promise<ScoreInput>`, `computeAndStoreScore(supabase: SupabaseClient, leadId: string): Promise<void>` (`lib/scoring/apply-score.ts`) — `loadScoreInput` is also consumed directly by Task 3's lead detail page; `computeAndStoreScore` is consumed by Task 3's `recalculateScoreAction`.

- [ ] **Step 1: Create `lib/scoring/apply-score.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateScore } from "./calculate-score";
import type { ScoreInput } from "@/types/scoring";

interface LeadFieldsForScoring {
  id: string;
  rating: number | null;
  review_count: number | null;
  industry: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
}

// Takes whatever lead shape the caller already has (a full LeadRecord from
// a page load, or the minimal columns computeAndStoreScore selects below)
// and loads the two extra pieces scoring needs: the latest *completed*
// audit's score (not just the latest audit — a currently-failed retry of a
// previously-successful audit shouldn't erase a known website score) and
// whether the lead has a named contact.
export async function loadScoreInput(supabase: SupabaseClient, lead: LeadFieldsForScoring): Promise<ScoreInput> {
  const { data: audit } = await supabase
    .from("website_audits")
    .select("overall_score")
    .eq("lead_id", lead.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count } = await supabase
    .from("lead_contacts")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", lead.id);

  return {
    rating: lead.rating,
    reviewCount: lead.review_count,
    industry: lead.industry,
    phone: lead.phone,
    email: lead.email,
    hasContact: (count ?? 0) > 0,
    city: lead.city,
    websiteAuditScore: audit ? audit.overall_score : undefined,
  };
}

// The one function every trigger point calls. Works with either a
// session-scoped client (RLS applies) or the service-role admin client
// (the Inngest function) — it does no org-scoping of its own, matching
// every other DB helper in this codebase that takes a SupabaseClient.
export async function computeAndStoreScore(supabase: SupabaseClient, leadId: string): Promise<void> {
  const { data: lead } = await supabase
    .from("leads")
    .select("id, rating, review_count, industry, phone, email, city")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;

  const input = await loadScoreInput(supabase, lead);
  const breakdown = calculateScore(input);

  await supabase
    .from("leads")
    .update({ score: breakdown.overallScore, score_category: breakdown.scoreCategory })
    .eq("id", leadId);
}
```

- [ ] **Step 2: Wire into `lib/lead-gen/create-lead.ts`**

The current file (read it first to confirm it hasn't changed) ends with:

```ts
  await createActivity(supabase, lead.id, "created", "Lead created from generation", {
    generation_job_id: generationJobId,
  });

  return lead.id as string;
}
```

Add the import at the top of the file and one call before the `return`:

```ts
import { computeAndStoreScore } from "@/lib/scoring/apply-score";
```

```ts
  await createActivity(supabase, lead.id, "created", "Lead created from generation", {
    generation_job_id: generationJobId,
  });

  await computeAndStoreScore(supabase, lead.id as string);

  return lead.id as string;
}
```

- [ ] **Step 3: Wire into `lib/inngest/functions/audit-website.ts`**

The current file (read it first to confirm it hasn't changed) has two places that mark an audit completed — the unreachable branch and the reachable branch. Add the import, then add one new step in each branch, right after the existing `mark-completed`/`save-unreachable` step and before the `log-activity` step:

```ts
import { computeAndStoreScore } from "@/lib/scoring/apply-score";
```

In the unreachable branch, after:
```ts
    if (!fetchResult.reachable) {
      await step.run("save-unreachable", async () => {
        await saveIssues(supabase, auditId, []);
        await markAuditCompleted(supabase, auditId, null, null, fetchResult.error ?? "The site could not be reached.");
      });
      await step.run("log-activity", () => createActivity(supabase, audit.lead_id, "audited", "Website audited"));
      return { reachable: false };
    }
```
add a step between the existing `save-unreachable` and `log-activity` steps:
```ts
    if (!fetchResult.reachable) {
      await step.run("save-unreachable", async () => {
        await saveIssues(supabase, auditId, []);
        await markAuditCompleted(supabase, auditId, null, null, fetchResult.error ?? "The site could not be reached.");
      });
      await step.run("update-lead-score", () => computeAndStoreScore(supabase, audit.lead_id));
      await step.run("log-activity", () => createActivity(supabase, audit.lead_id, "audited", "Website audited"));
      return { reachable: false };
    }
```

In the reachable branch, after:
```ts
    await step.run("save-issues", () => saveIssues(supabase, auditId, fetchResult.findings));
    await step.run("mark-completed", () =>
      markAuditCompleted(supabase, auditId, scores, overall, interpretation.summary, interpretation.talkingPoints),
    );
    await step.run("log-activity", () => createActivity(supabase, audit.lead_id, "audited", "Website audited"));
```
add a step between `mark-completed` and `log-activity`:
```ts
    await step.run("save-issues", () => saveIssues(supabase, auditId, fetchResult.findings));
    await step.run("mark-completed", () =>
      markAuditCompleted(supabase, auditId, scores, overall, interpretation.summary, interpretation.talkingPoints),
    );
    await step.run("update-lead-score", () => computeAndStoreScore(supabase, audit.lead_id));
    await step.run("log-activity", () => createActivity(supabase, audit.lead_id, "audited", "Website audited"));
```

- [ ] **Step 4: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

- [ ] **Step 5: Commit**

```bash
git add lib/scoring/apply-score.ts lib/lead-gen/create-lead.ts lib/inngest/functions/audit-website.ts
git commit -m "Wire score computation into lead creation and audit completion"
```

---

### Task 3: Manual recalculate action + score breakdown UI

**Files:**
- Modify: `app/(dashboard)/leads/[id]/actions.ts` (add `recalculateScoreAction`)
- Create: `components/leads/score-breakdown-card.tsx`
- Modify: `app/(dashboard)/leads/[id]/page.tsx` (compute the breakdown and render the card)

**Interfaces:**
- Consumes: `computeAndStoreScore`, `loadScoreInput` (Task 2), `calculateScore` (Task 1), `ScoreBreakdown` (Task 1)
- Produces: `recalculateScoreAction(leadId: string): Promise<void>`, `ScoreBreakdownCard` component.

- [ ] **Step 1: Add `recalculateScoreAction` to `app/(dashboard)/leads/[id]/actions.ts`**

The current file (read it first to confirm it hasn't changed) already has six exports (`markContactedAction`, `addNoteAction`, `rescheduleFollowUpAction`, `clearFollowUpAction`, `runAuditAction`, `retryAuditAction`) and imports `revalidatePath`, `createClient`, and `inngest`. Add one new import and one new function at the end of the file — leave everything else untouched:

```ts
import { computeAndStoreScore } from "@/lib/scoring/apply-score";
```

```ts
export async function recalculateScoreAction(leadId: string) {
  const supabase = await createClient();
  await computeAndStoreScore(supabase, leadId);
  revalidatePath(`/leads/${leadId}`);
}
```

- [ ] **Step 2: Create `components/leads/score-breakdown-card.tsx`**

```tsx
"use client";

import { useTransition } from "react";
import { recalculateScoreAction } from "@/app/(dashboard)/leads/[id]/actions";
import { Button } from "@/components/ui/button";
import type { ScoreBreakdown, ScoreFactor } from "@/types/scoring";

function FactorRow({ label, factor }: { label: string; factor: ScoreFactor | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">
        {factor ? `${factor.points}/${factor.maxPoints}` : "Not yet assessed"}
      </span>
    </div>
  );
}

export function ScoreBreakdownCard({ leadId, breakdown }: { leadId: string; breakdown: ScoreBreakdown }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">SCORE BREAKDOWN</h2>
        <form action={() => startTransition(() => recalculateScoreAction(leadId))}>
          <Button type="submit" variant="outline" size="sm" disabled={isPending}>
            Recalculate
          </Button>
        </form>
      </div>
      <div className="flex flex-col gap-1.5">
        <FactorRow label="Website opportunity" factor={breakdown.websiteOpportunity} />
        <FactorRow label="Business activity" factor={breakdown.businessActivity} />
        <FactorRow label="Wibsity fit" factor={breakdown.wibsityFit} />
        <FactorRow label="Contactability" factor={breakdown.contactability} />
        <FactorRow label="Local relevance" factor={breakdown.localRelevance} />
        <FactorRow label="Other" factor={breakdown.other} />
      </div>
      <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
        <span className="text-foreground">TOTAL</span>
        <span className="text-foreground">{breakdown.overallScore}/100</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into `app/(dashboard)/leads/[id]/page.tsx`**

The current file (read it first to confirm it hasn't changed) is:

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

Replace it with (adds two imports, one `loadScoreInput`/`calculateScore` call, and one rendered component):

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLeadById, getNotesForLead } from "@/lib/crm/leads";
import { getActivitiesForLead } from "@/lib/crm/activities";
import { getLatestAuditForLead } from "@/lib/audits/queries";
import { loadScoreInput } from "@/lib/scoring/apply-score";
import { calculateScore } from "@/lib/scoring/calculate-score";
import { LeadDetailHeader } from "@/components/leads/lead-detail-header";
import { ContactInfoCard } from "@/components/leads/contact-info-card";
import { AuditCard } from "@/components/leads/audit-card";
import { ScoreBreakdownCard } from "@/components/leads/score-breakdown-card";
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
  const scoreInput = await loadScoreInput(supabase, lead);
  const scoreBreakdown = calculateScore(scoreInput);

  return (
    <>
      <LeadDetailHeader lead={lead} />
      <ContactInfoCard lead={lead} />
      <AuditCard leadId={lead.id} website={lead.website} audit={audit} />
      <ScoreBreakdownCard leadId={lead.id} breakdown={scoreBreakdown} />
      <FollowUpCard leadId={lead.id} nextFollowupAt={lead.next_followup_at} />
      <LeadNotes leadId={lead.id} notes={notes} />
      <ActivityTimeline activities={activities} />
    </>
  );
}
```

`getLeadById`'s return type (`LeadRecord`, from `types/lead.ts`) already includes every field `loadScoreInput` needs (`id`, `rating`, `review_count`, `industry`, `phone`, `email`, `city`) — no change to `getLeadById` itself.

- [ ] **Step 4: Verify**

Run: `npm run build && npm run lint`
Expected: both pass clean.

Then run `npm run dev`, sign in with the seeded operator, and open a lead that has `rating`/`review_count`/`industry`/`phone`/`email`/`city` set (most seeded leads do). Confirm the "SCORE BREAKDOWN" card renders between the audit card and the follow-up card, shows six factor rows plus a TOTAL line, and that "Website opportunity" shows "Not yet assessed" for a lead with no completed audit.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/leads/[id]/actions.ts" components/leads/score-breakdown-card.tsx "app/(dashboard)/leads/[id]/page.tsx"
git commit -m "Add score breakdown UI and manual recalculate action"
```

---

### Task 4: End-to-end manual verification and README update

This task has no new source files beyond the README — it exercises both trigger points against the real Inngest dev server and the live Supabase project, since a stored `leads.score` update inside an Inngest function isn't something a unit test can observe.

**Files:**
- Modify: `README.md` (status table)

- [ ] **Step 1: Start both dev processes**

Run in one terminal: `npm run dev`
Run in another terminal: `npx inngest-cli dev`

- [ ] **Step 2: Verify the lead-creation trigger**

Submit a lead-generation job from `/leads/new` (see the Phase 3 flow — mock provider, any industry/location). Once it completes, open one of the newly created leads. Confirm:
- The SCORE BREAKDOWN card shows a real, non-seed score (not the placeholder `null`/`0` state from before this feature existed).
- `businessActivity`/`wibsityFit`/`contactability`/`localRelevance` reflect that lead's actual `rating`/`industry`/`phone`/`city` (cross-check against the CONTACT card above it).
- `websiteOpportunity` shows "Not yet assessed" (no audit has run yet for this brand-new lead).

- [ ] **Step 3: Verify the audit-completion trigger**

From that same lead, click "Run audit" (Phase 4's feature). Once it completes, reload the lead detail page. Confirm:
- `websiteOpportunity` now shows a real `X/30` value, inverted from the audit's `overall_score` (a low audit score should produce a high opportunity score, and vice versa — spot-check the arithmetic by hand against the audit card's displayed Overall score).
- The TOTAL and category (visible via `/leads`' HOT/WARM/LOW/SKIP badge, or by checking `leads.score_category` directly) updated to reflect the new factor.

- [ ] **Step 4: Verify the manual Recalculate action**

Directly edit that lead's `rating` in the Supabase Table Editor (simulating data drift the automatic triggers wouldn't catch, since there's no "edit lead" form yet). Reload the lead detail page — confirm the displayed breakdown's `businessActivity` reflects the new rating immediately (it's computed live at render time, so no action is needed for the *display* to update). Then click "Recalculate" and confirm the lead's row in `/leads` (sorted or filtered by score) now reflects the new stored `score`/`score_category` too.

- [ ] **Step 5: Update README**

In `README.md`, update the "What's real vs. a Phase 1 stub" table's `/leads`, `/leads/[id]` row to mention scoring:

```markdown
| `/leads`, `/leads/[id]` | Real: search, filters, notes, activity timeline, follow-ups (Phase 2); deterministic lead scoring with a factor breakdown (Lead Scoring) |
```

- [ ] **Step 6: Final verification**

Run: `npm run build && npm run lint`
Run: `npx tsx lib/scoring/calculate-score.test.ts`
Expected: everything passes clean.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "Verify lead scoring end-to-end and update README status"
```

---

## Self-Review Notes

- **Spec coverage:** all five active factor formulas (§15, Task 1) ✓; normalized-to-100 overall total with null-factor exclusion (Task 1) ✓; centralized `TARGET_INDUSTRIES`/`TARGET_SERVICE_AREAS` config (Task 1) ✓; deterministic/testable engine with no AI (Task 1, tested directly) ✓; "other" fixed at 0, not invented (Task 1) ✓; both trigger points wired (Task 2) ✓; score breakdown on the lead detail page (Task 3) ✓; manual recalculate fallback (Task 3) ✓.
- **Out of scope confirmed absent from tasks:** no AI involvement in scoring, no general "edit lead" form, no new migration, no new Inngest function, no expansion of the target-industry/service-area defaults beyond what the design spec set.
