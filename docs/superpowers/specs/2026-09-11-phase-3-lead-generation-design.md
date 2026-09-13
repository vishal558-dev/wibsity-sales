# Phase 3: Lead Generation — Design

**Spec sections:** `docs/wibsity-sales-build-spec.md` §8 (Generate Leads form), §9 (Lead Discovery Pipeline), §19 (`generation_jobs`/`generation_results` schema), §23 (provider abstraction), §24 (file structure), §27 (UX states), §30 (Data Quality/dedup), §35 (env vars), §37 (Lead generation acceptance criteria).

## Goal

Make `/leads/new` create real, asynchronous lead-generation jobs that discover businesses, normalize and deduplicate them against existing leads, and persist qualified ones as `leads` rows — with visible progress and graceful failure. No fake data behind the button; the business-search provider is a clearly-labeled mock (see Scope boundary) rather than a stub of a real integration.

## Scope boundary

The spec's §9 pipeline diagram runs from discovery through website checks, deterministic scoring, and AI qualification all the way to CRM. The phase table (§Phase 3 vs §Phase 4) splits this: **Phase 3 stops after lead-record creation.** Website availability/technical analysis, scoring, and AI summarization are Phase 4. Leads created in Phase 3 have `score` / `score_category` = `null` until Phase 4 runs.

```
Generation request → discover (provider) → normalize → deduplicate → create lead records
```

## Business-search provider

Google Places API was the obvious real choice but costs money, which is off the table. No free provider was picked either (OpenStreetMap's data quality for Indian SMBs was judged too weak to be worth building against yet). So Phase 3 ships the **abstraction only**, with a mock implementation:

- `providers/business-search/index.ts` — exports the `BusinessSearchProvider` interface (`search(params): Promise<RawBusiness[]>`, params = `{ industry, location, count }`) and `getBusinessSearchProvider()`, the single factory/swap point. `RawBusiness` is shaped to match what Google Places' Place Details API actually returns (`external_id` ~ Place ID, `name`, `website`, `phone` ~ `formatted_phone_number`, `rating`, `review_count` ~ `user_ratings_total`, `city`/`state` parsed from `formatted_address`) so a future `google-places.ts` implementation is a drop-in, not a redesign.
- `providers/business-search/mock.ts` — the **only** implementation shipped in this phase, and explicitly dev/test-only. Deterministically generates plausible businesses for the given industry/location: varying rating, review count, and city; *some* results are given a missing phone, missing website, or sub-threshold rating so the form's filters (see below) have real work to do. Clearly named/commented as a placeholder, not treated as production data (spec engineering rule: demo/seed data is fine in dev, not as the production data layer for something claiming to be real).
- `getBusinessSearchProvider()` reads `BUSINESS_SEARCH_PROVIDER` (default `"mock"`); any other value throws a clear "not implemented" error rather than silently falling back. **Google Places itself is not implemented in this phase** — only the seam for it.

When a real provider is available later, only a new `google-places.ts` + one factory branch are added — nothing else in the pipeline changes.

## Normalize + deduplicate

`lib/lead-gen/normalize.ts`:
- domain: lowercase, strip protocol/`www.`/trailing slash from `website`
- phone: strip all non-digit characters
- business name: collapse whitespace, trim

`lib/lead-gen/deduplicate.ts`: for each normalized result, check it against **existing `leads` rows in the organization** (not just siblings in the same batch) using the spec's §30 key priority, first match wins:
1. external provider ID (`lead_sources.external_id` for that provider)
2. normalized website domain
3. normalized phone number
4. normalized business name + city

A match marks the result `duplicate` — no lead row created, no `lead_sources`/`lead_contacts` insert.

## Filter gating

Form filters (min rating, website required, phone required) are applied **after** normalize+dedup, as a qualify gate on non-duplicate results:
- passes all filters → `generation_results.status = 'created'`, a `leads` row (+ `lead_sources` row recording provider/external_id/raw_data) is created, counts toward `qualified_count`
- fails a filter → `generation_results.status = 'filtered'`, no lead row, counts toward `analyzed_count` but not `qualified_count`
- duplicate → `generation_results.status = 'duplicate'`, counts toward `duplicate_count`

Every `generation_results` row starts life as `status = 'pending'` when first discovered, and moves to exactly one of `created` / `filtered` / `duplicate` once processed — never back. This resting state is what makes resumability (below) possible: "unprocessed" is a real, queryable value, not something inferred from job-level counters.

`generation_jobs` counters (`found_count`/`analyzed_count`/`qualified_count`/`duplicate_count`/`progress`) are never incremented in place. They're **recomputed from an aggregate `COUNT ... GROUP BY status` over that job's `generation_results` rows** after each item is processed, and written as an absolute value. This is what makes the counters safe to recompute after a retry or a resumed run — there's no risk of double-counting an item that was already tallied by a prior attempt, because the count always reflects current row states, not a running total.

## Idempotent, resumable jobs

A job must survive a crash mid-run, an Inngest-triggered retry, or a user clicking Retry on a failed job — in every case, without creating duplicate leads or losing leads already created.

- **Discovery is resumable.** Before calling the provider, the function checks whether `generation_results` rows already exist for this `generation_job_id`. If they do (this is a resumed/retried run, not a fresh one), discovery is skipped entirely and processing continues straight from the existing rows. Only a genuinely new job calls the provider and bulk-inserts its results as `pending`.
- **Each result is processed at most once.** The per-result work (normalize → dedupe-check → filter-gate → create-or-mark) runs inside an Inngest `step.run` keyed by that `generation_results` row's id (`process-result-${result.id}`). Inngest memoizes completed steps within a run, so a mid-run crash-and-retry never redoes finished items. Independently of Inngest's memoization, the per-result loop only ever selects rows still in `status = 'pending'` — so even a **brand-new function invocation** for the same `generation_job_id` (e.g. the manual Retry path below, which is not the same Inngest run) naturally skips every row already resolved to `created`/`filtered`/`duplicate` and only touches what's left.
- **Lead creation is dedup-guarded regardless.** Because the dedupe check (against existing `leads` in the org) runs immediately before every lead insert, even a hypothetical double-process of the same result can't produce two lead rows for the same business — the second attempt would see the first one's lead as an existing match. `generation_results.lead_id` (new nullable column, see Migration below) records which lead a `created` result produced, both for this guarding and for auditing.
- **Partial success is preserved on failure.** If a step throws after Inngest exhausts its own retries, the function's `onFailure` handler sets `generation_jobs.status = 'failed'` with a human-readable `error` and the final recomputed counters — it does **not** roll back or delete any `leads`/`generation_results` rows already created by earlier, successful steps.
- **Migration** (`db/migrations/0004_generation_results_lead_id.sql`): add nullable `lead_id uuid references leads(id) on delete set null` to `generation_results`, plus an index. No RLS change needed — `generation_results`' existing `org_isolation` policy (scoped via its parent `generation_jobs`) already covers the new column.

## Idempotent Inngest processing

- The function is registered with `id: "generate-leads"` and no event-level `idempotency` key. An earlier draft set `idempotency: "event.data.jobId"`, but Phase 3 Task 11 manual verification found this silently broke manual retry: Inngest deduped the retry's resend of the same `jobId` against the original failed run, so clicking Retry did nothing. It was removed in favor of relying purely on the resumability guarantees above — each step only touches `generation_results` rows still in `status = 'pending'`, so a brand-new run for the same `jobId` (concurrent or retried) naturally can't double-process or duplicate work even without an event-level dedupe key.
- The event payload is just `{ jobId }` — the function loads the job row (and its `organization_id`) itself rather than trusting anything else from the caller.
- **Manual retry re-sends the same event for the same job**, rather than creating a new `generation_jobs` row: `retryGenerationAction(jobId)` resets a `failed` job's `status` back to `pending` and re-sends `leadgen/job.created` with the same `jobId`. This supersedes an earlier draft of this design that had Retry resubmit the form as a brand-new job — resumability above is what makes re-running the *same* job safe, so there's no reason to fork a new one and orphan the partially-completed first attempt.

## Organization-scoped security

RLS already fully covers this (`db/migrations/0002_rls_policies.sql`): `generation_jobs` has a direct `org_isolation` policy, and `generation_results` has one scoped through its parent `generation_jobs` — both `using`/`with check` against `current_organization_id()`. No policy changes needed for `generation_jobs`/`generation_results`; the one new column (`lead_id`) inherits the existing policy.

What *does* need explicit handling is that this safety net only applies to the `authenticated` role — it does not apply to `service_role`, which `db/migrations/0003_grants.sql` already grants full table access to and which bypasses RLS entirely, in anticipation of exactly this kind of background job:

- `submitGenerationAction` and `retryGenerationAction` run through the normal session-bound client (`lib/supabase/server.ts`). RLS enforces org-scoping on these automatically — a signed-in user physically cannot create or retry a job row for another organization, the same guarantee every other mutation in this codebase already relies on.
- The Inngest function itself runs outside any user session (invoked by Inngest's own webhook, not a logged-in request), so it needs a service-role client — new `lib/supabase/admin.ts`, used **only** inside `lib/inngest/functions/generate-leads.ts` and nowhere else. Because that client bypasses RLS, every query it issues (loading the job, dedupe-checking `leads`, inserting `leads`/`lead_sources`/`generation_results`, updating job counters) must explicitly filter or set `organization_id` in code — the job row's own `organization_id` is the one source of truth for this, loaded once at the top of the function and threaded through every subsequent query.
- The client-side polling in `GenerationProgress` reads through the normal browser client, so a user polling a guessed job id belonging to another org gets no row back — same behavior as every other org-scoped read in this app.

## Async execution — Inngest

Spec §Background jobs mandates Inngest; not yet a dependency, adding it.

- `lib/inngest/client.ts` — Inngest client
- `lib/inngest/functions/generate-leads.ts` — the one function described above (resumable discovery, per-result steps, `onFailure` handler, service-role client, org-scoped queries)
- `app/api/inngest/route.ts` — serves the function to Inngest's runtime (local dev via `npx inngest-cli dev`, no keys needed locally; `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` added to `.env.example` for production per spec §35)
- `app/(dashboard)/leads/new/actions.ts` — `submitGenerationAction(formData)`: validates input (zod), inserts `generation_jobs` row (`status: 'pending'`), sends the Inngest event `{ jobId }`, returns the job id immediately. Request never blocks on the pipeline. Same file also exports `retryGenerationAction(jobId)` (see above).

## UI

- `components/leads/generation-form.tsx` (`GenerationForm`): fields per spec §8 — Industry, Location, Number of leads, Minimum rating, Website required, Only businesses with phone. `react-hook-form` + zod resolver, matching the existing form pattern in this codebase. "Future filters" (review count, category, radius, language, has-email) are explicitly out of scope (spec labels them "optional future").
- `app/(dashboard)/leads/new/page.tsx`: renders `GenerationForm`; on submit, navigates to `/leads/new?job=<id>`.
- `components/leads/generation-progress.tsx` (`GenerationProgress`): polls the `generation_jobs` row by id every ~1.5s via a plain client-side `setInterval` + Supabase select (no realtime infrastructure exists in this codebase yet, so none is added) until `status` is `completed` or `failed`. Renders the found/analyzed/qualified/duplicate counts and a progress bar per the §8 mockup. On `failed`, shows the error text and a Retry button that calls `retryGenerationAction(jobId)` — re-running the *same* job rather than submitting a new one (spec §27's required failure UX; resumability above makes this safe and preserves any leads the first attempt already created) — no spinner left hanging.

## Validation

- Provider output validated with a zod schema before normalize/dedup touches it (spec engineering rule: validate external data) — a malformed result from the provider fails that item, not the whole job.
- Form input (industry/location required, count/rating within sane bounds) validated with zod on submit.

## Testing

Following this codebase's existing self-check convention (`lib/crm/followups.test.ts` — plain `assert`, no framework, run via `node --experimental-strip-types` or the project's existing script):
- `lib/lead-gen/normalize.test.ts` — phone/domain/name normalization cases
- `lib/lead-gen/deduplicate.test.ts` — each of the four match-key cases, plus a non-match case
- Manual verification step in the plan (not a unit test, since it needs the real Inngest dev server + Supabase): run a generation job, kill it mid-run or force a failure, confirm already-created leads survive, re-run the same job via Retry, and confirm counters end up correct with no duplicate leads.

## Out of scope (explicitly deferred)

- Real business-search provider (Google Places or a free alternative) — future session once a provider decision + credentials exist
- Website availability/technical checks, deterministic scoring, AI qualification (Phase 4)
- Realtime progress push (kept to polling)
- "Optional future filters" from spec §8 (review count, category, radius, language, has-email)
- Scheduled/recurring generation, additional providers (Phase 6)
