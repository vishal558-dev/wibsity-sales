# wibsity sales

Internal lead generation and CRM for wibsity. See `docs/wibsity-sales-build-spec.md`
for the full product spec: this is **Phase 1: Foundation** only (auth, protected
shell, navigation, route shells, database schema, RLS, seed data, and a dashboard
wired to real data). Lead generation, website audits, the leads table, and the
pipeline board are stubbed and land in later phases.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase (Postgres + Auth) · Zod

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (or use an existing one).

2. **Copy environment variables**:

   ```bash
   cp .env.example .env.local
   ```

   Fill in from Project Settings → API in the Supabase dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (server-only: never expose this to the browser)

   Also set `SEED_OPERATOR_EMAIL` / `SEED_OPERATOR_PASSWORD`: these become the one
   login the seed script creates.

3. **Run the database migrations** in the Supabase SQL Editor, in order:
   - `db/migrations/0001_initial_schema.sql`: all 14 tables
   - `db/migrations/0002_rls_policies.sql`: Row Level Security policies
   - `db/migrations/0003_grants.sql`: table/function grants for the `authenticated`
     and `service_role` roles (tables created via raw SQL don't get Supabase's usual
     auto-grants, so this step is required)
   - `db/migrations/0004_generation_job_filters_and_result_lead_id.sql`: Phase 3
     lead-generation job filters and result-to-lead linkage

4. **Install dependencies and seed demo data**:

   ```bash
   npm install
   npx tsx --env-file=.env.local db/seed.ts
   ```

   This creates one organization, one operator login (`SEED_OPERATOR_EMAIL`/
   `SEED_OPERATOR_PASSWORD`), all 9 pipeline stages, and 20 fictional leads with
   contacts, sources, a few audits, and activity history. Re-running it clears
   the previous demo org first.

5. **Run the app**:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) and sign in with the
   seeded operator credentials.

6. **Run background jobs locally** (needed for `/leads/new` to actually generate leads):

   ```bash
   npx inngest-cli dev
   ```

   This auto-discovers `app/api/inngest` with no keys needed in development.

## What's real vs. a Phase 1 stub

| Area | Status |
|---|---|
| Auth (login, protected routes, sign out) | Real: Supabase Auth |
| Dashboard (KPIs, today's actions, priority leads, recent activity) | Real: queries the seeded data |
| Database schema + RLS (all 14 tables) | Real |
| `/leads`, `/leads/[id]` | Real: search, filters, notes, activity timeline, follow-ups (Phase 2) |
| `/pipeline` | Real: drag-and-drop stage changes (Phase 2) |
| `/leads/new` | Real: async generation via Inngest, mock provider only (Phase 3) |
| `/audits`, `/audits/[id]` | Route shell only: Phase 4 |
| `/settings` | Shows the signed-in account; no editable settings yet |

## Regenerating types later

Types in `types/` are hand-written to match the SQL migrations. Once the project
is linked with the Supabase CLI, they can be regenerated instead:

```bash
supabase gen types typescript --project-id <project-ref> > types/database.ts
```

## Production build

```bash
npm run build
npm run lint
```
