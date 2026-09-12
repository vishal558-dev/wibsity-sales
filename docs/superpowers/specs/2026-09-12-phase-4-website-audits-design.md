# Phase 4: Website Audits — Design

**Spec sections:** `docs/wibsity-sales-build-spec.md` §11 (Website audit block on lead detail), §13 (`/audits`, `/audits/[id]`), §14 (Website analysis — deterministic checks, AI interpretation rules), §19 (`website_audits`/`audit_issues` schema), §38 (Website audit acceptance criteria).

## Goal

Let a user run a real audit of a lead's website from the lead detail page: fetch the page, run deterministic technical checks against it, turn the findings into per-category scores and a prioritized issue list, and have an AI layer turn that evidence into a plain-language summary and call talking points — without ever presenting an unmeasured or invented fact as a measured one.

## Scope boundary

The build spec's Phase 4 bullet list is "website fetcher, technical checks, audit creation, audit UI, AI interpretation, lead score, score breakdown." This spec covers everything except the last two: **lead scoring (the weighted 0–100 formula across website/business-activity/contactability/local-relevance/etc.) is its own follow-up phase**, not covered here. Reasons: four of the six scoring factors have nothing to do with the website (business activity, contactability, local relevance, "other signals"), so scoring is a separate design problem that happens to consume this phase's output as one input, not a natural extension of it. `leads.score` / `leads.score_category` stay exactly as they are today (seed-populated, no engine) until that follow-up phase.

Also explicitly out for this phase (see "Out of scope" at the end for the full list): **Performance scoring** — no headless browser or third-party API is added this phase, so `performance_score` stays permanently `null`/"could not reliably measure," matching the spec's own example of preferring an honest non-answer over a fabricated number.

```
Run audit → fetch website → parse HTML → run checks → compute category scores → AI-interpret evidence → persist audit + issues → activity "audited"
```

## Website fetcher & checks

A single Inngest step (`fetch-and-check`) does a plain `fetch()` of the lead's `website` URL — 8s timeout, a standard browser `User-Agent` header (some sites block default fetch UAs), following redirects, capped response size (2MB) to avoid pathological pages. This is **static HTML only** — no JS execution, so client-side-rendered sites will show as thin/empty. That's a real, disclosed limitation: any check that comes up empty because of this says so in its evidence rather than implying the page has no content.

If the fetch fails outright (DNS failure, timeout, non-2xx status, non-HTML content-type), no checks run — the audit is stored with all scores `null` and a `summary` stating the site was unreachable and why. This is not a `failed` job; reachability is itself a finding (see "Async job" below).

On a successful fetch, the HTML is parsed with `cheerio` (new dependency — a jQuery-like server-side HTML parser, the standard lightweight choice for this; no headless browser needed since nothing here requires rendering or JS execution). Checks, grouped by the category score they feed:

**SEO**
- `<title>` present and 10–60 characters (too short/long/missing all flagged, different message each)
- `<meta name="description">` present and 50–160 characters
- exactly one `<h1>` (checks `<h1>` count only — the implementation shipped without the skipped-heading-level check originally scoped here; "Heading structure" as implemented measures h1 count, not full document heading order)
- `<img>` alt-text coverage: percentage of `<img>` tags with a non-empty `alt` attribute; below 80% flagged

**Mobile UX**
- `<meta name="viewport">` present — the only check in this category. Its absence is the strongest single signal a plain HTML fetch can give about mobile-readiness without actually rendering the page, so it's scored as a full-category fail rather than a partial deduction (see Scoring rubric). The audit's evidence and AI summary are explicit that this is a heuristic, not a rendering test.

**Conversion**
- a CTA-shaped element above an estimated fold: the first ~600px worth of markup order (approximated as "before the first `<h2>` or 40% into the body, whichever comes first" — a heuristic, documented as such) contains a `<button>` or prominent `<a>` whose text matches action language (contact, call, book, quote, buy, get started, sign up, order, schedule)
- contactability: a `tel:` link, `mailto:` link, or a `<form>` element present anywhere on the page
- at least one recognizable social link (`facebook.com`, `instagram.com`, `linkedin.com`, `twitter.com`/`x.com`, `wa.me`/`whatsapp`)

**Cross-cutting (not scored into a category, but always recorded as issues when they fail)**
- HTTPS vs HTTP (the stored `website` uses `http://`)
- reachability itself (see above — this one can prevent every other check from running at all)

Explicitly **not** attempted this phase: broken-link crawling (needs a bounded async fetch-per-link budget that's more complexity than this phase's value justifies) and performance metrics (see Scope boundary).

Every failed check produces one `audit_issues` row: `category`, `severity` (see Scoring rubric), `title`, `description`, `evidence` (jsonb — e.g. the actual tag content found, or `null` for reachability). Passed checks produce no row — `audit_issues` is a findings list, not a full check log.

## Scoring rubric

Deterministic, no AI involved. Each scored category (SEO, Mobile UX, Conversion) starts at 100 and loses fixed points per failed check, floored at 0:

| Category | Check | Points |
|---|---|---|
| SEO | missing/bad title | −30 |
| SEO | missing/bad meta description | −25 |
| SEO | heading structure | −20 |
| SEO | low alt-text coverage | −25 |
| Mobile UX | no viewport meta tag | −100 |
| Conversion | no above-fold CTA | −40 |
| Conversion | no contact method | −40 |
| Conversion | no social links | −20 |

**Overall** = the average of whichever category scores were actually computed (Performance is always excluded from both the sum and the denominator this phase — it's omitted, not zero-weighted). If the fetch itself failed, `overall_score` and every category score are `null`; there is no "0 for unreachable" — that would misrepresent "couldn't check" as "checked and failed."

**Issue severity** mirrors the point value of the check that produced it: `high` (≥30 pts), `medium` (15–29 pts), `low` (<15 pts). This keeps "Top issues" (sorted by severity, then category) an honest reflection of what actually moved the score, with no separate severity judgment to keep in sync.

## Async job — Inngest

Mirrors the `generate-leads` function's proven shape (`lib/inngest/functions/generate-leads.ts`) rather than inventing a new pattern:

- Event: `audits/website.requested` (own namespace — this isn't lead generation), payload `{ auditId }` — the function loads the audit row (and its `lead_id` → `organization_id`) itself, same trust boundary as Phase 3.
- Steps: `load-audit` → `mark-processing` → `fetch-and-check` (fetch, parse, run checks, compute category scores — see above; on unreachable, skip straight to a "no scores" completed state) → `interpret` (AI layer, below) → `save-issues` → `mark-completed`.
- `onFailure`: sets `status: 'failed'`, `error: <message>` — same as Phase 3. Given the fetch/parse/check step is a single bounded operation (not a per-item loop like lead generation), there's no meaningful partial-success state to preserve; a failed run just needs a clean retry.
- **No event-level `idempotency` key** — Task 11 of Phase 3 found that Inngest's idempotency dedup silently drops a legitimate retry that resends the same id, since a retry *has to* reuse the same id. Steps already gate correctly (each step is naturally re-runnable — `mark-processing` is idempotent, `fetch-and-check` simply redoes the fetch, `save-issues` replaces rather than appends). (Worth fixing the stale comment about this in the Phase 3 design doc separately — noted, out of scope here.)
- Retry re-sends the same event for the same `auditId`, exactly like `retryGenerationAction` — no new row, no orphaned partial attempt.

**Migration** (`db/migrations/0005_website_audit_status.sql`): `website_audits.overall_score` and `.summary` become nullable (a pending/processing row has neither yet); add `status text not null default 'pending' check (status in ('pending','processing','completed','failed'))` and `error text`. No RLS change — the existing `org_isolation` policy (scoped via the `leads` join) already covers new columns, same precedent as Phase 3's migration 0004.

**Trigger** (`app/(dashboard)/leads/[id]/actions.ts`, new `runAuditAction(leadId)`): validates the lead has a `website`, inserts a `website_audits` row (`status: 'pending'`, lead_id), sends the Inngest event, returns immediately — request never blocks on the fetch. A `retryAuditAction(auditId)` mirrors `retryGenerationAction`.

## AI interpretation seam

No AI provider is wired up in this codebase yet, and no API key is available right now, so — mirroring exactly how Phase 3 handled not having a real business-search provider — this phase ships the **abstraction plus a mock implementation**, not a stub that silently does nothing:

- `providers/ai-interpreter/index.ts` — exports the `AiInterpreter` interface (`interpret(evidence: AuditEvidence): Promise<{ summary: string; talkingPoints: string[] }>`) and `getAiInterpreter()`, reading `AI_INTERPRETER_PROVIDER` (default `"mock"`; any other value throws a clear "not implemented" error, same convention as `getBusinessSearchProvider()`).
- `providers/ai-interpreter/mock.ts` — the only implementation shipped this phase. **Template-based, not a real LLM call** — it composes `summary`/`talkingPoints` strings purely by combining the category scores and the specific `audit_issues` that were actually produced (e.g. only mentions mobile navigation if the viewport check actually failed). This isn't a placeholder that happens to look plausible — it's mechanically incapable of inventing a finding that isn't in the evidence, which satisfies the spec's "AI should NOT invent technical facts" rule by construction rather than by prompting discipline. When a real key/provider is available later, only a new `providers/ai-interpreter/anthropic.ts` (or similar) + one factory branch are added.
- If the fetch itself failed (site unreachable), the interpreter isn't called — the stored `summary` is a fixed, direct statement of unreachability, not something worth spending an "AI interpretation" step on.

## UI

- `components/leads/audit-card.tsx` — new section on the lead detail page (`app/(dashboard)/leads/[id]/page.tsx`), shown only when the lead has a `website`. Shows the latest `website_audits` row for the lead (scores, AI summary, "Run audit" / "Re-run audit" button — the implementation shipped without a top-issues list on this card; the full issue list lives on `/audits/[id]`, one click away via "View full audit"). While `status` is `pending`/`processing`, polls and shows progress exactly like `GenerationProgress` (`components/leads/generation-progress.tsx`) — same ~1.5s interval, same completed/failed terminal handling, same Retry-on-failed button calling `retryAuditAction`.
- `app/(dashboard)/audits/page.tsx` — replaces the current empty-state stub. Table per spec §13: Business, Overall, Created, Status — one row per lead (its latest audit only), via `distinct on (lead_id) ... order by lead_id, created_at desc` then re-sorted by `created_at desc` for display. Row links to the lead (not a separate details concept — see next point).
- `app/(dashboard)/audits/[id]/page.tsx` — full audit detail per spec §13: overall + per-category scores (with "not measured" shown plainly for Performance, never a fake number or a blank), technical findings (the `audit_issues` list, grouped by category), AI summary, priority issues, recommended talking points. Linked from both the `/audits` table and the lead detail audit card.
- New activity: `runAuditAction`/the completed Inngest run creates an `audited` activity on the lead (spec §17 already lists `audited` as a supported activity type — this phase is what actually starts using it), matching the "Website audited" row already shown in the spec's example timeline.

## Validation

- Fetched HTML is untrusted external input — `cheerio` parsing itself is safe (no script execution), but anything pulled out of it (title text, meta content) is stored as plain data, never interpolated into anything executed or rendered unescaped.
- `runAuditAction` checks the lead actually has a non-empty `website` before creating a job — the UI doesn't show the button otherwise, but the action re-checks server-side rather than trusting the UI.

## Testing

Following this codebase's self-check convention (plain `assert`, run via `npx tsx`, same as `lib/lead-gen/*.test.ts`):
- `lib/audits/checks.test.ts` — one case per check (pass and fail), fed synthetic HTML strings through the same cheerio-based check functions used by the Inngest step
- `lib/audits/score.test.ts` — category math (multiple failed checks floor at 0, not negative) and the overall-average-excluding-null-categories rule
- `providers/ai-interpreter/mock.test.ts` — confirms the mock only ever mentions issues actually present in the input evidence (the anti-hallucination property, tested directly rather than assumed)
- Manual verification step in the plan (needs the real Inngest dev server): run an audit against a real reachable site and confirm scores/issues look sane, run one against an unreachable URL and confirm the "could not measure" path (no crash, no fabricated scores), and exercise Retry on a forced failure.

## Out of scope (explicitly deferred)

- Lead scoring engine (the weighted 0–100 formula, score breakdown UI) — its own follow-up phase
- Performance scoring (headless browser or PageSpeed-style API)
- Broken-link crawling
- JS-rendered content (no headless browser this phase — static HTML fetch only)
- A real AI provider (Anthropic/OpenAI key) — the seam is built, the key/implementation is not
- Auto-triggering audits on lead creation — manual "Run audit" button only
- Audit history UI (multiple past audits per lead are retained in the data model, but only the latest is surfaced in `/audits` and the lead detail card this phase)
