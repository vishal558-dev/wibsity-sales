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

- `providers/business-search/index.ts` — exports the `BusinessSearchProvider` interface (`search(params): Promise<RawBusiness[]>`, params = `{ industry, location, count }`) and `getBusinessSearchProvider()`, the single factory/swap point.
- `providers/business-search/mock.ts` — the only implementation. Deterministically generates plausible businesses for the given industry/location: varying rating, review count, and city; *some* results are given a missing phone, missing website, or sub-threshold rating so the form's filters (see below) have real work to do. Clearly named/commented as a placeholder, not treated as production data (spec engineering rule: demo/seed data is fine in dev, not as the production data layer for something claiming to be real — this provider is explicitly the "not yet real" seam, matching the spec's own instruction to abstract the provider layer so it can be swapped later).

When a real provider is available later, only `mock.ts` gets replaced/added-alongside and the factory updated — nothing else in the pipeline changes.

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

`generation_jobs` counters map to the §8 progress mockup as: `found_count` = raw provider result count (set once), `analyzed_count`/`qualified_count`/`duplicate_count`/`progress` incremented as each result is processed.

## Async execution — Inngest

Spec §Background jobs mandates Inngest; not yet a dependency, adding it.

- `lib/inngest/client.ts` — Inngest client
- `lib/inngest/functions/generate-leads.ts` — one function triggered by event `leadgen/job.created`; steps: fetch from provider → normalize → loop results (dedupe check → filter gate → create lead or mark filtered/duplicate, updating `generation_jobs` counters per result)
- `app/api/inngest/route.ts` — serves the function to Inngest's runtime (local dev via `npx inngest-cli dev`, no keys needed locally; `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` added to `.env.example` for production per spec §35)
- `app/(dashboard)/leads/new/actions.ts` — `submitGenerationAction(formData)`: validates input (zod), inserts `generation_jobs` row (`status: 'pending'`), sends the Inngest event with the job id, returns the job id immediately. Request never blocks on the pipeline.

Provider or pipeline failure inside the Inngest function is caught at the step level, sets `generation_jobs.status = 'failed'` with a human-readable `error`; nothing partial is left looking like success.

## UI

- `components/leads/generation-form.tsx` (`GenerationForm`): fields per spec §8 — Industry, Location, Number of leads, Minimum rating, Website required, Only businesses with phone. `react-hook-form` + zod resolver, matching the existing form pattern in this codebase. "Future filters" (review count, category, radius, language, has-email) are explicitly out of scope (spec labels them "optional future").
- `app/(dashboard)/leads/new/page.tsx`: renders `GenerationForm`; on submit, navigates to `/leads/new?job=<id>`.
- `components/leads/generation-progress.tsx` (`GenerationProgress`): polls the `generation_jobs` row by id every ~1.5s via a plain client-side `setInterval` + Supabase select (no realtime infrastructure exists in this codebase yet, so none is added) until `status` is `completed` or `failed`. Renders the found/analyzed/qualified/duplicate counts and a progress bar per the §8 mockup. On `failed`, shows the error text and a Retry button that resubmits the same form values (spec §27's required failure UX) — no spinner left hanging.

## Validation

- Provider output validated with a zod schema before normalize/dedup touches it (spec engineering rule: validate external data) — a malformed result from the provider fails that item, not the whole job.
- Form input (industry/location required, count/rating within sane bounds) validated with zod on submit.

## Testing

Following this codebase's existing self-check convention (`lib/crm/followups.test.ts` — plain `assert`, no framework, run via `node --experimental-strip-types` or the project's existing script):
- `lib/lead-gen/normalize.test.ts` — phone/domain/name normalization cases
- `lib/lead-gen/deduplicate.test.ts` — each of the four match-key cases, plus a non-match case

## Out of scope (explicitly deferred)

- Real business-search provider (Google Places or a free alternative) — future session once a provider decision + credentials exist
- Website availability/technical checks, deterministic scoring, AI qualification (Phase 4)
- Realtime progress push (kept to polling)
- "Optional future filters" from spec §8 (review count, category, radius, language, has-email)
- Scheduled/recurring generation, additional providers (Phase 6)
