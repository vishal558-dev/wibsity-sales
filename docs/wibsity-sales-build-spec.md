# wibsity Sales: Lead Generation + CRM
## Product Requirements Document, UX Wireframes, Architecture, Tech Stack, and Build Specification

> **IMPORTANT:** This document is the source of truth for building the internal wibsity sales application.
>
> Brand name is always lowercase: **wibsity**
>
> Public website: **https://wibsity.in**
>
> Internal sales application: **https://app.wibsity.in**
>
> Build the internal application as a separate Next.js/Vercel project. Do not merge it into the public marketing website codebase.

---

# 1. PRODUCT VISION

Build a private internal sales platform for wibsity that finds potential business clients, analyzes their websites, scores their sales potential, and lets the operator manage the entire sales pipeline.

The core question the product must answer is:

> **"Who should I contact today?"**

The product should prioritize speed, clarity, and action over excessive analytics or enterprise complexity.

The core loop is:

```text
Find leads
   ↓
Deduplicate
   ↓
Analyze website
   ↓
Qualify
   ↓
Score
   ↓
Prioritize
   ↓
Contact
   ↓
Track activity
   ↓
Follow up
   ↓
Close client
```

V1 should be practical and usable by one operator. Avoid unnecessary enterprise features.

---

# 2. PRODUCT NAME

Internal product name:

**wibsity sales**

Primary URL:

**app.wibsity.in**

Public brand:

**wibsity**

Public website:

**wibsity.in**

Never capitalize the brand as "Wibsity" in UI copy, metadata, headings, or generated content.

---

# 3. PRODUCT GOALS

## Primary goals

1. Find qualified business prospects quickly.
2. Automatically analyze publicly accessible business websites.
3. Produce an understandable lead score.
4. Surface the highest-value prospects first.
5. Provide a lightweight CRM for outreach and follow-ups.
6. Make it extremely easy to call or contact a lead.
7. Keep a complete activity history.
8. Make the system extensible for future automation.

## Secondary goals

1. Generate concise AI-powered website insights.
2. Create useful talking points before a sales call.
3. Reduce manual lead research.
4. Eventually automate follow-ups and recurring lead generation.

## Non-goals for V1

Do NOT build:

- Full email marketing platform
- Mass email campaign system
- Automated mass calling
- Client portal
- Billing
- Invoicing
- Team management
- Mobile native app
- Complex permissions
- Huge analytics suite
- AI chatbot
- 50+ integrations
- Complex marketing automation builder

Keep V1 focused.

---

# 4. TARGET USER

V1 has one primary user:

**wibsity operator / owner**

The application is desktop-first.

The user may generate around 50 leads per day and manually call prospects.

The UI must therefore optimize for:

- scanning
- prioritization
- fast navigation
- quick contact actions
- quick status updates
- follow-up tracking

---

# 5. DESIGN DIRECTION

Create a premium, minimal, dark-first SaaS interface.

Design references in spirit:

- Linear
- Attio
- Vercel
- Stripe dashboard

Do not copy their interfaces.

## Visual principles

- Dark interface
- Strong typography
- Lots of whitespace
- Subtle borders
- Small-to-medium corner radii
- Minimal shadows
- Compact tables
- Clear hierarchy
- Subtle animations only where useful
- Fast perceived performance
- Keyboard-friendly interactions
- Avoid giant cards
- Avoid excessive gradients
- Avoid decorative UI that doesn't improve usability

The application should feel like a serious internal sales cockpit.

---

# 6. INFORMATION ARCHITECTURE

Main navigation:

```text
wibsity

Dashboard
Leads
Pipeline
Audits

----------------

Settings
```

Optional later:

```text
Tasks
Analytics
Integrations
```

Do not add these to V1 unless required.

---

# 7. DASHBOARD

Route:

`/dashboard`

The dashboard is an action screen, not an analytics museum.

## Header

```text
Good afternoon 👋

Here’s what needs your attention today.
```

## KPI strip

Show:

```text
🔥 Hot leads
🟡 Warm leads
📞 Follow-ups due
💬 Replies
🎯 Demos / meetings
```

Example:

```text
18
Hot leads

12
Follow-ups

4
Replies

7
Demos
```

## Today's actions

Display leads that require action today.

Example:

```text
TODAY'S ACTIONS

ABC Solar
Noida, UP
Score 91 🔥
Follow up today

[Open Lead]

XYZ Energy
Delhi, India
Score 86 🔥
Follow up today

[Open Lead]
```

## Recent activity

Show recent:

- calls
- status changes
- audits
- demos
- notes
- meetings

## Priority leads

Show highest-scoring uncontacted leads.

---

# 8. LEAD GENERATION

Route:

`/leads/new`

Primary purpose: create a lead-generation job.

## Form

Fields:

```text
Industry
[ Solar companies ]

Location
[ Noida ]

Number of leads
[ 50 ]

Minimum rating
[ 3.5 ]

Website required
[x]

Only businesses with phone
[x]
```

Optional future filters:

- review count
- business category
- city radius
- language
- has email

## Generate button

```text
[ Generate leads ]
```

## Generation progress

After submission:

```text
Finding businesses...

██████████████░░░░ 73%

Found             37
Analyzed          24
Qualified         16
Duplicates         5
```

Generation must run asynchronously.

Do not block a browser request while scraping/analyzing dozens of leads.

---

# 9. LEAD DISCOVERY PIPELINE

The backend workflow:

```text
Generation request
       ↓
Business discovery provider
       ↓
Normalize data
       ↓
Deduplicate
       ↓
Create lead records
       ↓
Website availability check
       ↓
Website technical analysis
       ↓
Deterministic scoring
       ↓
AI qualification / summary
       ↓
Final lead score
       ↓
CRM
```

The provider layer must be abstracted.

Do not tightly couple business discovery logic to one external provider.

---

# 10. LEADS PAGE

Route:

`/leads`

Default layout: table.

Header:

```text
LEADS

[ Search leads... ] [ Filters ] [+ Generate Leads]
```

Table columns:

```text
Business
Location
Industry
Score
Status
Last contact
Next action
```

Example:

```text
ABC Solar       Noida       Solar       🔥 91    New
Sun Energy      Delhi       Solar       🔥 87    Contacted
GreenVolt       Noida       Solar       🟡 72    Demo Sent
SolarMax        Ghaziabad  Solar       ⚪ 48    Qualified
```

## Filters

V1:

- score category
- status
- industry
- location
- has website
- has phone
- has email
- follow-up due
- source

## Search

Search across:

- business name
- phone
- email
- website
- city
- industry

---

# 11. LEAD DETAIL

Route:

`/leads/[id]`

This is the most important page in the CRM.

## Header

```text
← Back to Leads

ABC SOLAR

Noida, UP

🔥 91 / 100
HOT LEAD

[ Call ]
[ WhatsApp ]
[ Open Website ]
[ Mark Contacted ]
```

Contact buttons should use available contact information.

Do not display an action if the relevant contact detail doesn't exist.

## Contact section

```text
CONTACT

Phone
+91 XXXXX XXXXX

Email
hello@example.com

Website
abcsolar.in

Source
Business directory / provider

Location
Noida, Uttar Pradesh
```

## AI analysis

```text
WHY THIS LEAD?

✓ Active business
✓ Strong local presence
✓ Website has clear improvement opportunities
✓ Contact information available
✓ Good fit for wibsity
```

## Website audit

Show:

```text
WEBSITE AUDIT

Overall              61
Performance          72
Mobile UX             58
SEO                   64
Conversion            41
```

Then:

```text
TOP ISSUES

1. No strong CTA above the fold
2. Weak mobile navigation
3. Missing meta description
```

## Recommended talking points

Generate short, practical sales talking points.

Example:

```text
CALL TALKING POINTS

• Their website doesn't make the next action obvious.
• Mobile navigation could be improved.
• Their business appears active enough to justify a stronger web presence.
```

These are internal notes, not automatically sent to the prospect.

## Notes

Allow freeform notes.

```text
[ Add note... ]
```

## Activity timeline

```text
ACTIVITY

Sep 11
Lead created

Sep 11
Website audited

Sep 12
Called

Sep 15
Follow-up scheduled

Sep 18
Demo sent
```

Every meaningful CRM action should create an activity.

---

# 12. CRM PIPELINE

Route:

`/pipeline`

Kanban board.

Columns:

```text
NEW
QUALIFIED
CONTACTED
REPLIED
DEMO SENT
MEETING
PROPOSAL
WON
LOST
```

Cards show:

```text
ABC Solar
🔥 91
Noida

Next:
Follow up today
```

Drag-and-drop status changes should create a `status_changed` activity.

Cards should not become giant.

---

# 13. WEBSITE AUDITS

Route:

`/audits`

Table:

```text
AUDITS

Business       Overall    Created       Status
ABC Solar      61         Sep 11        Complete
Sun Energy     74         Sep 11        Complete
GreenVolt      69         Sep 10        Complete
```

Audit detail:

`/audits/[id]`

Show:

- Overall score
- Performance
- Mobile
- SEO
- Conversion
- Accessibility/basic UX observations where available
- Technical findings
- AI summary
- Priority issues
- Recommended improvements

Avoid presenting technical measurements as guaranteed facts if a check was inconclusive.

---

# 14. WEBSITE ANALYSIS

Use deterministic checks wherever possible.

Potential checks:

- HTTP/HTTPS
- page reachable
- mobile viewport / responsive behavior
- page title
- meta description
- heading structure
- CTA presence
- contact information
- social links
- obvious broken links
- basic performance metrics
- basic accessibility signals
- page structure
- image alt text presence where technically available

AI should interpret findings.

AI should NOT invent technical facts.

Example:

Bad:

> "Your website has a 4.2 second load time."

when no reliable measurement exists.

Good:

> "The audit could not reliably measure load time."

---

# 15. LEAD SCORING

Score from 0 to 100.

Initial weighting:

```text
Website opportunity         30
Business legitimacy/activity 20
Wibsity fit                  20
Contactability               15
Local relevance              10
Other useful signals          5
```

Categories:

```text
80-100 = HOT
60-79  = WARM
40-59  = LOW
0-39   = SKIP
```

The scoring engine must be deterministic where possible.

AI may provide a recommendation/interpretation, but core numerical scoring should be explainable.

Show score factors on the lead detail page.

Example:

```text
SCORE BREAKDOWN

Website opportunity      26/30
Business activity        18/20
Wibsity fit              17/20
Contactability           13/15
Local relevance           8/10
Other                     4/5

TOTAL                    86/100
```

---

# 16. CRM STATUSES

Canonical pipeline stages:

```text
new
qualified
contacted
replied
demo_sent
meeting
proposal
won
lost
```

A lead should have exactly one current pipeline stage.

Status changes must be timestamped.

---

# 17. ACTIVITY TYPES

Supported activity types:

```text
created
audited
called
whatsapp
email
note
status_changed
demo_sent
meeting
proposal
won
lost
follow_up_scheduled
```

Each activity:

```text
id
lead_id
type
description
metadata
created_at
```

---

# 18. FOLLOW-UPS

Each lead can have:

```text
last_contacted_at
next_followup_at
```

Dashboard should surface overdue and due follow-ups.

Examples:

```text
OVERDUE
ABC Solar
2 days overdue

DUE TODAY
XYZ Energy
```

Allow:

```text
[ Mark done ]
[ Reschedule ]
```

V1 does not need complex task management.

---

# 19. DATABASE

Use PostgreSQL through Supabase.

Core tables:

```text
users
organizations
leads
lead_contacts
lead_sources
lead_tags
lead_tag_assignments
lead_activities
lead_notes
website_audits
audit_issues
pipeline_stages
generation_jobs
generation_results
```

## leads

```text
id UUID primary key
organization_id UUID
business_name TEXT
website TEXT nullable
phone TEXT nullable
email TEXT nullable
industry TEXT nullable
city TEXT nullable
state TEXT nullable
country TEXT default 'India'
rating NUMERIC nullable
review_count INTEGER nullable
source TEXT nullable
source_url TEXT nullable

score INTEGER nullable
score_category TEXT nullable

pipeline_stage_id UUID
last_contacted_at TIMESTAMP nullable
next_followup_at TIMESTAMP nullable

created_at TIMESTAMP
updated_at TIMESTAMP
```

## lead_contacts

```text
id UUID
lead_id UUID
name TEXT nullable
role TEXT nullable
phone TEXT nullable
email TEXT nullable
source TEXT nullable
created_at TIMESTAMP
updated_at TIMESTAMP
```

Only store contact information that is legitimately obtained and permitted for the intended use.

## lead_sources

```text
id UUID
lead_id UUID
provider TEXT
external_id TEXT nullable
source_url TEXT nullable
raw_data JSONB nullable
created_at TIMESTAMP
```

## lead_activities

```text
id UUID
lead_id UUID
type TEXT
description TEXT
metadata JSONB nullable
created_at TIMESTAMP
```

## lead_notes

```text
id UUID
lead_id UUID
content TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

## website_audits

```text
id UUID
lead_id UUID
overall_score INTEGER
performance_score INTEGER nullable
mobile_score INTEGER nullable
seo_score INTEGER nullable
conversion_score INTEGER nullable

summary TEXT
raw_results JSONB nullable

created_at TIMESTAMP
updated_at TIMESTAMP
```

## audit_issues

```text
id UUID
audit_id UUID
category TEXT
severity TEXT
title TEXT
description TEXT
evidence JSONB nullable
created_at TIMESTAMP
```

## pipeline_stages

```text
id UUID
organization_id UUID
name TEXT
slug TEXT
position INTEGER
created_at TIMESTAMP
```

## generation_jobs

```text
id UUID
organization_id UUID
industry TEXT
location TEXT
requested_count INTEGER

status TEXT
progress INTEGER
found_count INTEGER
analyzed_count INTEGER
qualified_count INTEGER
duplicate_count INTEGER

error TEXT nullable

created_at TIMESTAMP
updated_at TIMESTAMP
completed_at TIMESTAMP nullable
```

## generation_results

```text
id UUID
generation_job_id UUID
external_id TEXT nullable
business_name TEXT
raw_data JSONB nullable
status TEXT
created_at TIMESTAMP
```

---

# 20. AUTHENTICATION

Use Supabase Auth.

V1:

- Email/password login
- Protected dashboard routes
- Logged-out users redirected to `/login`

Future:

- Google login
- team accounts
- roles/permissions

Do not build team permissions in V1.

---

# 21. SECURITY

This is an internal application, so security matters.

Implement:

- Supabase Row Level Security
- authenticated access only
- server-side validation
- API key secrets only on server
- never expose provider API keys to browser
- validate URLs before fetching
- rate-limit expensive endpoints
- sanitize user-provided text where needed
- prevent unauthorized access to another organization
- avoid logging sensitive API keys or private contact data

Do not put secrets in client-side JavaScript.

---

# 22. TECH STACK

## Frontend

```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui
Lucide icons
```

Use the current stable versions at implementation time.

Use App Router.

## Hosting

```text
Vercel
```

Deployment:

```text
app.wibsity.in → Vercel
```

The public website at:

```text
wibsity.in
```

is a separate project.

## Database

```text
Supabase
PostgreSQL
```

## Authentication

```text
Supabase Auth
```

## Background jobs

Use:

```text
Inngest
```

for asynchronous workflows.

If there is a strong technical reason to use another job system, document it before changing the architecture.

## AI

Use an LLM API through a server-side abstraction.

Keep prompts in:

```text
lib/ai/prompts/
```

Never hardcode secrets.

## Validation

Use:

```text
Zod
```

for API/server input validation.

## Forms

Use:

```text
React Hook Form
Zod
```

where forms become non-trivial.

## Data fetching

Prefer:

- Server Components for initial data
- Server Actions where appropriate
- API routes for external integrations/webhooks
- TanStack Query only where client-side caching/interactive fetching genuinely helps

Do not add libraries just because they are popular.

---

# 23. PROVIDER ABSTRACTION

Do not hardcode one lead source into the entire application.

Create interfaces similar to:

```ts
interface BusinessSearchProvider {
  searchBusinesses(input: BusinessSearchInput): Promise<BusinessSearchResult[]>;
}
```

and:

```ts
interface WebsiteAnalyzer {
  analyze(url: string): Promise<WebsiteAnalysis>;
}
```

This allows providers to be swapped later.

Potential provider categories:

```text
business search
website fetching
website performance
email discovery
AI
```

Provider credentials belong only in environment variables.

---

# 24. FILE STRUCTURE

Use this architecture as the starting point:

```text
wibsity-sales/
│
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   │
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   │
│   │   ├── leads/
│   │   │   ├── page.tsx
│   │   │   ├── new/
│   │   │   │   └── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   │
│   │   ├── pipeline/
│   │   │   └── page.tsx
│   │   │
│   │   ├── audits/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   │
│   │   └── settings/
│   │       └── page.tsx
│   │
│   ├── api/
│   │   ├── leads/
│   │   ├── generation/
│   │   ├── audits/
│   │   └── webhooks/
│   │
│   ├── layout.tsx
│   └── globals.css
│
├── components/
│   ├── ui/
│   ├── dashboard/
│   ├── leads/
│   ├── pipeline/
│   ├── audits/
│   ├── forms/
│   └── navigation/
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── middleware.ts
│   │
│   ├── ai/
│   │   ├── analyze-lead.ts
│   │   ├── generate-insights.ts
│   │   └── prompts/
│   │
│   ├── lead-gen/
│   │   ├── discover.ts
│   │   ├── normalize.ts
│   │   ├── deduplicate.ts
│   │   ├── qualify.ts
│   │   └── score.ts
│   │
│   ├── website/
│   │   ├── fetch.ts
│   │   ├── analyze.ts
│   │   └── audit.ts
│   │
│   ├── crm/
│   │   ├── activities.ts
│   │   ├── pipeline.ts
│   │   └── followups.ts
│   │
│   └── utils/
│
├── providers/
│   ├── business-search/
│   │   └── index.ts
│   ├── website/
│   │   └── index.ts
│   ├── ai/
│   │   └── index.ts
│   └── email/
│       └── index.ts
│
├── db/
│   ├── migrations/
│   ├── schema/
│   └── seed.ts
│
├── types/
│   ├── lead.ts
│   ├── audit.ts
│   ├── pipeline.ts
│   └── generation.ts
│
├── public/
│
├── .env.example
├── .gitignore
├── middleware.ts
├── package.json
├── tsconfig.json
├── next.config.ts
└── README.md
```

Adjust the exact structure if Next.js conventions require it, but preserve separation of concerns.

---

# 25. ROUTES

Required routes:

```text
/login

/dashboard

/leads
/leads/new
/leads/[id]

/pipeline

/audits
/audits/[id]

/settings
```

API routes:

```text
/api/leads
/api/leads/[id]
/api/generation
/api/generation/[id]
/api/audits
/api/audits/[id]
/api/webhooks/*
```

Use server actions where they are cleaner than REST endpoints.

---

# 26. COMPONENTS

Important reusable components:

```text
AppSidebar
TopBar
PageHeader
StatCard
LeadTable
LeadRow
LeadScoreBadge
LeadStatusBadge
LeadFilters
LeadSearch
LeadCard
LeadDetailHeader
ContactActions
AuditScoreCard
AuditIssueList
ActivityTimeline
PipelineBoard
PipelineColumn
PipelineCard
GenerationForm
GenerationProgress
EmptyState
LoadingState
ErrorState
ConfirmDialog
```

Keep components composable.

Avoid huge monolithic page components.

---

# 27. UX STATES

Every async operation needs:

- loading state
- success state
- empty state
- error state

Example lead generation:

```text
Idle
↓
Submitting
↓
Job created
↓
Processing
↓
Completed
```

If generation fails:

```text
Lead generation failed.

[Retry]
```

Do not leave the user staring at a broken spinner.

---

# 28. RESPONSIVENESS

Desktop-first, but usable on tablet.

At minimum:

- sidebar collapses
- tables become horizontally scrollable
- lead detail remains readable
- pipeline becomes horizontally scrollable

No need to build a dedicated mobile app.

---

# 29. ACCESSIBILITY

Implement sensible accessibility:

- semantic buttons
- keyboard navigation
- visible focus states
- sufficient contrast
- labels for form inputs
- aria labels where needed
- don't rely solely on color for statuses

---

# 30. DATA QUALITY

Deduplication is critical.

Potential duplicate keys:

1. external provider ID
2. normalized website domain
3. normalized phone number
4. normalized business name + location

Normalize:

- phone numbers
- URLs
- domains
- whitespace
- business names

Do not create obvious duplicates.

---

# 31. AI PROMPTING

AI should receive structured evidence.

Example:

```json
{
  "business": {
    "name": "ABC Solar",
    "industry": "Solar",
    "location": "Noida"
  },
  "website": {
    "url": "https://example.com",
    "reachable": true
  },
  "technicalChecks": {
    "https": true,
    "hasMetaDescription": false,
    "mobileSignals": [],
    "ctaCount": 0
  }
}
```

Ask AI to return structured JSON.

Example output:

```json
{
  "fit": "high",
  "summary": "...",
  "opportunities": [
    "...",
    "..."
  ],
  "talkingPoints": [
    "...",
    "..."
  ]
}
```

Validate AI output with Zod.

Never blindly trust model output.

---

# 32. OUTREACH

V1 should assist manual outreach rather than automate mass outreach.

Provide:

```text
[ Call ]
[ WhatsApp ]
[ Email ]
```

when relevant contact information exists.

Allow the operator to record:

```text
Called
No answer
Interested
Not interested
Follow up
Demo sent
```

These actions create activities.

Do not build bulk unsolicited outreach in V1.

Respect applicable laws, platform rules, consent requirements, and opt-out requests when using contact information.

---

# 33. DASHBOARD PRIORITIZATION

The dashboard should prioritize:

1. overdue follow-ups
2. follow-ups due today
3. high-score uncontacted leads
4. recent replies
5. active opportunities

The user should never need to manually sort through hundreds of leads to know what to do next.

---

# 34. ANALYTICS

V1 analytics should be minimal.

Useful metrics:

```text
Total leads
Hot leads
Contacted
Replies
Demos
Meetings
Won
Conversion rate
```

Do not build complex charts until enough data exists to make them useful.

---

# 35. ENVIRONMENT VARIABLES

Create `.env.example`.

Expected categories:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

AI_API_KEY=

BUSINESS_SEARCH_API_KEY=

INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

Only include variables actually needed by the chosen providers.

Never commit real credentials.

---

# 36. DEPLOYMENT

Deployment architecture:

```text
GitHub
   ↓
Vercel
   ↓
app.wibsity.in
```

Supabase:

```text
PostgreSQL
Auth
RLS
```

Background jobs:

```text
Inngest
```

Public website remains a separate application:

```text
wibsity.in
```

Do not make the CRM part of the public website repository unless there is a compelling technical reason.

---

# 37. BUILD PHASES

## Phase 1: Foundation

Build:

- Next.js app
- TypeScript
- Tailwind
- shadcn/ui
- Supabase
- authentication
- dashboard shell
- sidebar
- routing
- database migrations
- RLS

Do not build scraping yet.

---

## Phase 2: CRM

Build:

- lead table
- lead detail
- search
- filters
- pipeline
- status changes
- notes
- activity timeline
- follow-up dates
- contact actions

Seed realistic demo data.

---

## Phase 3: Lead generation

Build:

- generation form
- provider abstraction
- asynchronous generation jobs
- normalization
- deduplication
- lead creation
- progress tracking

---

## Phase 4: Website intelligence

Build:

- website fetcher
- technical checks
- audit creation
- audit UI
- AI interpretation
- lead score
- score breakdown

---

## Phase 5: Sales workflow

Build:

- today's actions
- overdue follow-ups
- quick activity creation
- call/WhatsApp/email actions
- demo tracking
- meeting tracking
- proposal tracking
- won/lost tracking

---

## Phase 6: Automation

Only after V1 works:

- scheduled lead generation
- scheduled website refreshes
- follow-up reminders
- AI-generated outreach suggestions
- notifications
- additional providers

---

# 38. ACCEPTANCE CRITERIA

The V1 build is successful when:

### Authentication

- User can log in.
- Unauthenticated users cannot access dashboard routes.

### CRM

- User can create a lead.
- User can edit a lead.
- User can delete/archive a lead safely.
- User can search leads.
- User can filter leads.
- User can open lead details.
- User can move a lead through pipeline stages.
- Status changes create activities.
- Notes work.
- Follow-up dates work.
- Activity timeline works.

### Lead generation

- User can submit a generation job.
- Job runs asynchronously.
- Progress is visible.
- Results are persisted.
- Duplicates are prevented.
- Failed jobs expose useful errors.

### Website audit

- Website availability is checked.
- Technical findings are stored.
- Audit score is calculated.
- AI summary is generated from evidence.
- AI output is validated.
- Audit is visible from the lead.

### Dashboard

- Hot leads count works.
- Follow-up count works.
- Today's actions work.
- Priority leads are visible.
- Recent activity is visible.

### Deployment

- Production build works.
- Environment variables are documented.
- Supabase RLS is active.
- Vercel deployment works.
- `app.wibsity.in` can point to the Vercel project.

---

# 39. IMPORTANT ENGINEERING RULES

1. Do not build fake functionality behind buttons.
2. Do not use hardcoded demo data as the production data layer.
3. Demo/seed data is fine for development.
4. Use proper database persistence.
5. Use server-side secrets.
6. Validate external data.
7. Handle provider failures gracefully.
8. Make long-running work asynchronous.
9. Keep provider integrations modular.
10. Keep AI outputs structured and validated.
11. Keep components reusable.
12. Keep pages relatively thin.
13. Put business logic in `lib/`.
14. Do not over-engineer V1.
15. Prefer simple solutions until scale requires complexity.
16. Document architectural decisions.
17. Do not introduce a new dependency without a reason.
18. Make the application fast.
19. Do not expose internal CRM pages publicly.
20. Never use fabricated lead/contact information.
21. Respect applicable data protection, outreach, platform, and provider terms.
22. Do not build around bypassing anti-bot systems, authentication, paywalls, or access controls.

---

# 40. SEED DATA

Create realistic development seed data for:

```text
20 leads
5 pipeline stages minimum
multiple audits
multiple activities
multiple follow-ups
```

Use clearly fictional/demo contact information.

Do not use real people's private information in seed data.

---

# 41. DESIGN WIREFRAME SUMMARY

## Dashboard

```text
┌──────────────┬────────────────────────────────────────────┐
│              │ Dashboard                                  │
│ wibsity      │                                            │
│              │ Good afternoon 👋                          │
│ Dashboard    │                                            │
│ Leads        │ ┌────────┐ ┌────────┐ ┌────────┐          │
│ Pipeline     │ │ 18 HOT │ │ 12 DUE │ │ 4 REPLY│          │
│ Audits       │ └────────┘ └────────┘ └────────┘          │
│              │                                            │
│              │ Today's actions                            │
│              │ ┌──────────────────────────────────────┐   │
│              │ │ ABC Solar                  🔥 91      │   │
│              │ │ Follow up today                       │   │
│              │ │ [Open Lead]                            │   │
│              │ └──────────────────────────────────────┘   │
│              │                                            │
│              │ Recent activity                            │
│              │ ...                                        │
│              │                                            │
│ Settings     │                                            │
└──────────────┴────────────────────────────────────────────┘
```

## Leads

```text
┌──────────────┬────────────────────────────────────────────┐
│ Sidebar      │ Leads                                      │
│              │                                            │
│              │ [Search...] [Filters] [+ Generate Leads]  │
│              │                                            │
│              │ Business    Location Score Status          │
│              │ ABC Solar   Noida    🔥91  New             │
│              │ Sun Energy  Delhi    🔥87  Contacted       │
│              │ GreenVolt   Noida    🟡72  Demo Sent       │
│              │ SolarMax    Ghz      ⚪48  Qualified        │
└──────────────┴────────────────────────────────────────────┘
```

## Lead detail

```text
┌──────────────┬────────────────────────────────────────────┐
│ Sidebar      │ ← Leads                                    │
│              │                                            │
│              │ ABC SOLAR                                  │
│              │ Noida, UP                                  │
│              │ 🔥 91 / 100                                │
│              │                                            │
│              │ [Call] [WhatsApp] [Website] [Contacted]   │
│              │                                            │
│              │ CONTACT                                    │
│              │ Phone / Email / Website                    │
│              │                                            │
│              │ WHY THIS LEAD?                             │
│              │ ✓ Strong business activity                 │
│              │ ✓ Website opportunity                       │
│              │                                            │
│              │ WEBSITE AUDIT                              │
│              │ Overall 61                                  │
│              │ Mobile 58 | SEO 64 | CTA 41                │
│              │                                            │
│              │ NOTES                                      │
│              │ [Add note...]                              │
│              │                                            │
│              │ ACTIVITY                                   │
│              │ ● Lead created                             │
│              │ ● Website audited                          │
│              │ ● Called                                   │
└──────────────┴────────────────────────────────────────────┘
```

## Pipeline

```text
┌─────────────────────────────────────────────────────────────┐
│ Pipeline                                                    │
│                                                             │
│ NEW        QUALIFIED     CONTACTED     REPLIED              │
│                                                             │
│ ┌───────┐  ┌───────┐     ┌───────┐     ┌───────┐           │
│ │ABC    │  │Sun    │     │Green  │     │Bright │           │
│ │🔥91   │  │🔥84   │     │🟡78   │     │🔥86   │           │
│ │Noida  │  │Delhi  │     │Noida  │     │Delhi  │           │
│ └───────┘  └───────┘     └───────┘     └───────┘           │
└─────────────────────────────────────────────────────────────┘
```

## Generate leads

```text
┌──────────────────────────────────────────────────┐
│ Generate Leads                                   │
│                                                  │
│ Industry                                         │
│ [ Solar companies                         ]      │
│                                                  │
│ Location                                         │
│ [ Noida                                    ]      │
│                                                  │
│ Number of leads                                  │
│ [ 50                                       ]      │
│                                                  │
│ Minimum rating                                   │
│ [ 3.5                                      ]      │
│                                                  │
│ ☑ Website required                              │
│ ☑ Phone required                                │
│                                                  │
│ [ Generate Leads ]                               │
└──────────────────────────────────────────────────┘
```

---

# 42. FIRST IMPLEMENTATION TASK

Start with Phase 1 only.

Do not attempt to build the entire system in one pass.

First:

1. Initialize Next.js project.
2. Configure TypeScript.
3. Configure Tailwind.
4. Configure shadcn/ui.
5. Create Supabase integration.
6. Create authentication.
7. Create protected dashboard layout.
8. Create sidebar/navigation.
9. Create all required route shells.
10. Create database migrations for core tables.
11. Configure RLS.
12. Create seed data.
13. Build the dashboard using seed data.
14. Make the UI polished and responsive.
15. Verify production build.
16. Document setup in README.

Then proceed to Phase 2.

Do not start scraping or AI integration until the CRM foundation is working.

---

# 43. FINAL PRODUCT PRINCIPLE

The application should feel like this:

> Open app → instantly see who needs attention → open lead → understand why they're valuable → call → record outcome → know exactly who to contact next.

Every feature should support that loop.

If a feature doesn't improve lead discovery, qualification, prioritization, outreach, follow-up, or closing, it probably does not belong in V1.

Build the boring foundation correctly first. Then make the machine smarter.
