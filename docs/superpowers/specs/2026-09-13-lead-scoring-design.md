# Lead Scoring Engine — Design

**Spec sections:** `docs/wibsity-sales-build-spec.md` §15 (LEAD SCORING — weights, categories, score breakdown format).

## Goal

Give every lead a real, deterministic 0–100 score (`leads.score`/`score_category`, both existing columns currently only seed-populated) computed from data already in this codebase, with an explainable per-factor breakdown shown on the lead detail page — no AI in the calculation, no fabricated signal to fill a factor nothing measures yet.

## Scope boundary

This is the follow-up carved out of Phase 4's own brainstorming: Phase 4 shipped the website audit engine that produces `website_audits.overall_score`, one input to this score, but not the scoring formula itself (most of its factors have nothing to do with the website). This spec covers only the deterministic V1 engine — no AI interpretation of the score, no UI beyond the breakdown display, no new trigger surfaces beyond the two write paths that already exist.

## Factor formulas

All five active factors are independent, pure functions of already-loaded data — no factor depends on another's output. Each returns `{ points, maxPoints }` (or `null` for the one factor that can be genuinely unassessed), so the breakdown UI reads directly off what the formula produced, not a separately-maintained display string.

### Website opportunity — 30 pts, nullable

Input: the lead's latest **completed** `website_audits.overall_score` (0–100 or `null` if the audit was unreachable — see Phase 4's design). Inverted: a worse site score means more room for wibsity to help.

```
websiteOpportunity =
  no completed audit exists          → null ("Not yet assessed")
  audit exists, overall_score = null → null (site was unreachable — no signal, not a bad signal)
  audit exists, overall_score = N    → round((100 - N) * 0.3)   // 0-30
```

`null` here is a real, distinct state from `0` — it means "we don't know yet," not "this scored zero." It's excluded from both the earned-points sum and the max-points denominator when computing the overall total (see "Overall total" below), so a lead that hasn't been audited yet isn't punished for it.

### Business activity — 20 pts

Input: `leads.rating` (0–5 or `null`) and `leads.review_count` (integer or `null`). Unlike the website factor, a missing rating/review count here is itself a real signal (no reviews = low activity), not an unassessed state — so this factor always resolves to a number, never `null`.

```
ratingPoints (0-12)      = round((rating ?? 0) / 5 * 12), clamped [0, 12]
reviewCountPoints (0-8)  = review_count band:
  0            → 0
  1-9          → 2
  10-49        → 4
  50-99        → 6
  100+         → 8
businessActivity = ratingPoints + reviewCountPoints   // 0-20
```

### Wibsity fit — 20 pts

Input: `leads.industry` matched against `TARGET_INDUSTRIES` (centralized config, see below).

```
wibsityFit =
  industry is null/empty                          → 0
  industry matches TARGET_INDUSTRIES (case-insens.) → 20
  industry set but not on the list                 → 8   // unconfirmed fit, not assumed bad
```

### Contactability — 15 pts

Input: `leads.phone`, `leads.email`, and whether the lead has at least one `lead_contacts` row (a named contact). `leads.website` is deliberately **not** counted here — the website's condition is already fully covered by the Website opportunity factor, and counting it again here would double-weight the same signal under a "can we reach them" label it doesn't really belong to.

```
contactability = (phone ? 6 : 0) + (email ? 6 : 0) + (has named contact ? 3 : 0)   // 0-15
```

### Local relevance — 10 pts

Input: `leads.city` matched against `TARGET_SERVICE_AREAS` (centralized config, see below).

```
localRelevance =
  no city on the lead                    → 0
  city matches TARGET_SERVICE_AREAS      → 10
  city present but not a match           → 3   // still a real, locatable business, just outside the primary area
```

### Other useful signals — 5 pts, fixed

```
other = 0   // always — no real signal maps to this in V1; not faked to look non-zero
```

## Overall total

Normalized to 0–100 as required, computed as *(earned points) / (possible points given what's actually known) × 100* — this is what makes "null, not zero" for the website factor actually mean something, rather than being null in the breakdown but silently zeroed in the total:

```
knownFactors = [businessActivity, wibsityFit, contactability, localRelevance, other]
              + (websiteOpportunity if not null)

earnedPoints  = sum of knownFactors' points
possiblePoints = sum of knownFactors' maxPoints   // 100 if audited, 70 if not

overallScore = round(earnedPoints / possiblePoints * 100)   // always 0-100
```

Category thresholds are exactly the spec's: `80-100 = HOT`, `60-79 = WARM`, `40-59 = LOW`, `0-39 = SKIP`.

## Centralized config

`lib/scoring/config.ts` — the only place industry/location targets are named, so expanding wibsity's target market later is a one-file edit, not a hunt through scoring logic:

```ts
export const TARGET_INDUSTRIES = ["Solar", "Roofers"];
export const TARGET_SERVICE_AREAS = ["Noida", "Delhi", "Gurugram", "Faridabad", "Ghaziabad", "Meerut"];
```

Matches are case-insensitive exact-string comparisons, not substring checks — `"solar"` matches `"Solar"` but not `"Solar companies"` (the mock lead-generation provider's industry string from Phase 3). That's deliberate: `TARGET_INDUSTRIES` names real target trades, and a generated placeholder label shouldn't accidentally score as a confirmed match. `"Solar companies"` falls into the "set but not on the list" partial-credit branch instead, which is the honest outcome for demo/mock data anyway.

## Computation & storage model

`lib/scoring/calculate-score.ts` exports the pure, synchronous functions above plus one composing function:

```ts
export interface ScoreBreakdown {
  websiteOpportunity: { points: number; maxPoints: 30 } | null;
  businessActivity: { points: number; maxPoints: 20 };
  wibsityFit: { points: number; maxPoints: 20 };
  contactability: { points: number; maxPoints: 15 };
  localRelevance: { points: number; maxPoints: 10 };
  other: { points: number; maxPoints: 5 };
  overallScore: number;      // 0-100
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
  websiteAuditScore: number | null | undefined;   // undefined = no completed audit at all, null = audit ran but site unreachable — both collapse to "not yet assessed"
}

export function calculateScore(input: ScoreInput): ScoreBreakdown;
```

No network, no database, no AI — a plain function of its input, which is exactly what makes it unit-testable and exactly why it's the only thing under test (see Testing below).

A second, DB-touching function, `lib/scoring/apply-score.ts`'s `computeAndStoreScore(supabase, leadId)`, loads the lead's own fields, its latest completed audit's `overall_score` (or `undefined` if none exists), and whether it has any `lead_contacts` row, builds a `ScoreInput`, calls `calculateScore`, and writes `score`/`score_category` onto the `leads` row. This is the only place DB I/O happens for scoring.

**Trigger points** (the two existing write paths that change scoring inputs today):
- Right after a lead is created (`lib/lead-gen/create-lead.ts`'s `createLeadFromBusiness`, called from the Phase 3 Inngest pipeline).
- Right after a website audit reaches `completed` (`lib/inngest/functions/audit-website.ts`'s `mark-completed` step, both the reachable and unreachable branches). An unreachable-site outcome's `overall_score` is `null`, which the scoring formula treats the same as "no completed audit" — "we tried and couldn't measure" carries the same "no real signal" meaning as "haven't tried yet." Recomputing on both branches keeps the trigger simple ("whenever an audit finishes, recompute" — no branching on outcome) and is idempotent when the audit was unreachable, not wasted work.

**Manual fallback**: a "Recalculate" button on the lead detail page (`recalculateScoreAction(leadId)` server action) for any lead whose stored score has drifted from its current data (e.g. `rating`/`industry` edited directly in Supabase, or a contact added through the existing contacts flow) — there's no general "edit lead" form yet, so this is the escape hatch until one exists.

## UI: score breakdown display

The lead detail page **recomputes the breakdown live at render time** rather than persisting `ScoreBreakdown` as a JSON blob — it's a pure, synchronous function over data the page loads anyway (the lead row, its latest completed audit, its contacts), so there's no staleness between "what's displayed" and "what the current data actually says" by construction. Only the final `overallScore`/`scoreCategory` are persisted, into the existing `leads.score`/`score_category` columns, which is what `/leads`' list sorting and filtering already rely on — those stay in sync via the trigger points above, with "Recalculate" as the manual fix for anything the automatic triggers missed.

New component `components/leads/score-breakdown-card.tsx`, shown on the lead detail page per spec §15's mockup:

```
SCORE BREAKDOWN

Website opportunity      26/30
Business activity        18/20
Wibsity fit               8/20
Contactability            9/15
Local relevance           3/10
Other                      0/5

TOTAL                    64/100
```

Website opportunity renders "Not yet assessed" in place of "X/30" when `null`, matching the audit UI's own "Not measured" convention for Performance.

## Testing

Following this codebase's self-check convention (`assert`, `npx tsx`, no framework) — `lib/scoring/calculate-score.test.ts` covers exactly the pure `calculateScore` function, per your explicit list:
- missing completed audit → `websiteOpportunity: null`, total computed out of 70
- audit present but site unreachable (`overall_score: null`) → same `null` treatment as missing audit
- missing contact info (no phone/email/contact) → `contactability: 0`
- unknown/unlisted industry → `wibsityFit: 8`; no industry at all → `wibsityFit: 0`
- a range of ratings/review counts → confirms the banding table
- target vs. non-target service area → confirms `localRelevance`'s three branches
- a fully-populated "best case" lead → confirms the overall total and category boundary math (e.g. a lead landing exactly on the 80/60/40 thresholds)

`apply-score.ts` (DB-touching) gets no test, matching the established convention for I/O helpers in this codebase (`lib/lead-gen/job-store.ts`, `lib/audits/job-store.ts` — neither has one either).

## Out of scope (explicitly deferred)

- Any AI involvement in the numeric score (spec §15 allows AI only as a separate "recommendation/interpretation," which is not built here)
- A general "edit lead" form (the manual Recalculate button is the interim fix-up path)
- Expanding `TARGET_INDUSTRIES`/`TARGET_SERVICE_AREAS` beyond the seed-data-derived defaults — a one-file config edit whenever wibsity's real target market is known
- A real "Other useful signals" factor — stays at a documented, honest 0 until a real signal exists
