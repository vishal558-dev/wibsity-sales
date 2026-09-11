/**
 * Phase 1 demo data: one organization, one operator login, the canonical
 * pipeline stages, and 20 fictional leads with contacts, sources, a few
 * audits, and activity history so the dashboard has real variety to show.
 *
 * Run with: npx tsx db/seed.ts
 */
import { createClient } from "@supabase/supabase-js";

const SEED_ORG_NAME = "wibsity (demo)";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
const OPERATOR_EMAIL = process.env.SEED_OPERATOR_EMAIL;
const OPERATOR_PASSWORD = process.env.SEED_OPERATOR_PASSWORD;

if (!SUPABASE_URL || !SERVICE_KEY || !OPERATOR_EMAIL || !OPERATOR_PASSWORD) {
  throw new Error(
    "Missing env vars. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, SEED_OPERATOR_EMAIL, SEED_OPERATOR_PASSWORD (see .env.local).",
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PIPELINE_STAGES = [
  { name: "New", slug: "new" },
  { name: "Qualified", slug: "qualified" },
  { name: "Contacted", slug: "contacted" },
  { name: "Replied", slug: "replied" },
  { name: "Demo Sent", slug: "demo_sent" },
  { name: "Meeting", slug: "meeting" },
  { name: "Proposal", slug: "proposal" },
  { name: "Won", slug: "won" },
  { name: "Lost", slug: "lost" },
];

function scoreCategory(score: number) {
  if (score >= 80) return "HOT";
  if (score >= 60) return "WARM";
  if (score >= 40) return "LOW";
  return "SKIP";
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

// [businessName, city, state, industry, stageSlug, score, lastContactedDaysAgo, nextFollowupOffsetDays]
// lastContactedDaysAgo: null = never contacted. nextFollowupOffsetDays: negative = overdue, 0 = today, positive = future, null = none.
const LEADS: Array<
  [string, string, string, string, string, number, number | null, number | null]
> = [
  ["ABC Solar", "Noida", "Uttar Pradesh", "Solar", "contacted", 91, 6, 0],
  ["Sun Energy", "Delhi", "Delhi", "Solar", "contacted", 87, 4, -2],
  ["XYZ Energy", "Delhi", "Delhi", "Solar", "qualified", 86, null, 0],
  ["Bright Power Co", "Delhi", "Delhi", "Solar", "replied", 86, 2, 1],
  ["GreenVolt", "Noida", "Uttar Pradesh", "Solar", "demo_sent", 72, 5, 3],
  ["Suryoday Solaris", "Gurugram", "Haryana", "Solar", "qualified", 78, null, null],
  ["Helios Rooftop", "Faridabad", "Haryana", "Solar", "meeting", 81, 8, 7],
  ["Urja Solar Systems", "Ghaziabad", "Uttar Pradesh", "Solar", "new", 68, null, null],
  ["SolarMax", "Ghaziabad", "Uttar Pradesh", "Solar", "qualified", 48, null, null],
  ["Prakash Energy", "Meerut", "Uttar Pradesh", "Solar", "new", 44, null, null],
  ["Vidyut Solar", "Noida", "Uttar Pradesh", "Solar", "proposal", 84, 12, -1],
  ["Kiran Green Power", "Delhi", "Delhi", "Solar", "won", 89, 20, null],
  ["Tejas Solar Solutions", "Gurugram", "Haryana", "Solar", "lost", 52, 30, null],
  ["Surya Shakti Energy", "Faridabad", "Haryana", "Solar", "new", 61, null, null],
  ["Ravi Solarworks", "Noida", "Uttar Pradesh", "Solar", "contacted", 76, 3, -3],
  ["Aditya Power Roofs", "Delhi", "Delhi", "Solar", "qualified", 39, null, null],
  ["Chandra Solar", "Ghaziabad", "Uttar Pradesh", "Solar", "new", 55, null, null],
  ["Nova Renewables", "Gurugram", "Haryana", "Solar", "demo_sent", 74, 7, 2],
  ["Pure Watt Solar", "Meerut", "Uttar Pradesh", "Solar", "replied", 69, 1, 0],
  ["Arka Solar Homes", "Noida", "Uttar Pradesh", "Solar", "new", 33, null, null],
];

async function main() {
  console.log(`Seeding demo data for "${SEED_ORG_NAME}"...`);

  const { data: existingOrg } = await supabase
    .from("organizations")
    .select("id")
    .eq("name", SEED_ORG_NAME)
    .maybeSingle();

  if (existingOrg) {
    console.log("Removing previous demo org data...");
    await supabase.from("organizations").delete().eq("id", existingOrg.id);
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: SEED_ORG_NAME })
    .select("id")
    .single();
  if (orgError) throw orgError;
  const organizationId = org.id;

  const { data: existingAuthUsers } = await supabase.auth.admin.listUsers();
  const existingAuthUser = existingAuthUsers?.users.find(
    (u) => u.email === OPERATOR_EMAIL,
  );
  if (existingAuthUser) {
    await supabase.auth.admin.deleteUser(existingAuthUser.id);
  }

  const { data: authUser, error: authError } =
    await supabase.auth.admin.createUser({
      email: OPERATOR_EMAIL,
      password: OPERATOR_PASSWORD,
      email_confirm: true,
    });
  if (authError) throw authError;

  const { error: userError } = await supabase.from("users").insert({
    id: authUser.user.id,
    organization_id: organizationId,
    email: OPERATOR_EMAIL,
    full_name: "wibsity operator",
  });
  if (userError) throw userError;

  const { data: stages, error: stagesError } = await supabase
    .from("pipeline_stages")
    .insert(
      PIPELINE_STAGES.map((stage, index) => ({
        organization_id: organizationId,
        name: stage.name,
        slug: stage.slug,
        position: index,
      })),
    )
    .select("id, slug");
  if (stagesError) throw stagesError;
  const stageIdBySlug = new Map(stages.map((s) => [s.slug, s.id]));

  for (const [
    businessName,
    city,
    state,
    industry,
    stageSlug,
    score,
    lastContactedDaysAgo,
    nextFollowupOffsetDays,
  ] of LEADS) {
    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        organization_id: organizationId,
        business_name: businessName,
        website: `https://${slug}.example.com`,
        phone: "+91 98765 00000",
        email: `hello@${slug}.example.com`,
        industry,
        city,
        state,
        country: "India",
        rating: 3.8 + (score % 10) / 10,
        review_count: 10 + (score % 40),
        source: "Business directory",
        score,
        score_category: scoreCategory(score),
        pipeline_stage_id: stageIdBySlug.get(stageSlug),
        last_contacted_at:
          lastContactedDaysAgo === null
            ? null
            : daysFromNow(-lastContactedDaysAgo),
        next_followup_at:
          nextFollowupOffsetDays === null
            ? null
            : daysFromNow(nextFollowupOffsetDays),
      })
      .select("id")
      .single();
    if (leadError) throw leadError;
    const leadId = lead.id;

    await supabase.from("lead_contacts").insert({
      lead_id: leadId,
      name: "Owner",
      role: "Proprietor",
      phone: "+91 98765 00000",
      email: `hello@${slug}.example.com`,
      source: "Business directory",
    });

    await supabase.from("lead_sources").insert({
      lead_id: leadId,
      provider: "seed",
      source_url: `https://example.com/directory/${slug}`,
    });

    await supabase.from("lead_activities").insert({
      lead_id: leadId,
      type: "created",
      description: "Lead created",
    });

    if (lastContactedDaysAgo !== null) {
      await supabase.from("lead_activities").insert({
        lead_id: leadId,
        type: "called",
        description: "Called — discussed website audit findings",
        created_at: daysFromNow(-lastContactedDaysAgo),
      });
    }

    if (stageSlug === "demo_sent" || stageSlug === "meeting") {
      await supabase.from("lead_activities").insert({
        lead_id: leadId,
        type: "demo_sent",
        description: "Sent demo of wibsity's website audit",
      });
    }

    if (nextFollowupOffsetDays !== null) {
      await supabase.from("lead_activities").insert({
        lead_id: leadId,
        type: "follow_up_scheduled",
        description: "Follow-up scheduled",
      });
    }

    // A handful of leads get a full website audit.
    if (score >= 60 && score < 90) {
      const { data: audit, error: auditError } = await supabase
        .from("website_audits")
        .insert({
          lead_id: leadId,
          overall_score: Math.max(30, score - 20),
          performance_score: Math.max(20, score - 10),
          mobile_score: Math.max(20, score - 30),
          seo_score: Math.max(20, score - 15),
          conversion_score: Math.max(15, score - 35),
          summary: `${businessName}'s site is reachable but has clear room to convert more visitors into calls.`,
        })
        .select("id")
        .single();
      if (auditError) throw auditError;

      await supabase.from("audit_issues").insert([
        {
          audit_id: audit.id,
          category: "conversion",
          severity: "high",
          title: "No strong call-to-action above the fold",
          description:
            "Visitors have to scroll to find a way to contact the business.",
        },
        {
          audit_id: audit.id,
          category: "mobile",
          severity: "medium",
          title: "Weak mobile navigation",
          description: "The menu is difficult to use on small screens.",
        },
      ]);

      await supabase.from("lead_activities").insert({
        lead_id: leadId,
        type: "audited",
        description: "Website audited",
      });
    }

    if (stageSlug === "contacted" || stageSlug === "qualified") {
      await supabase.from("lead_notes").insert({
        lead_id: leadId,
        content: "Interested but wants to see examples of past work first.",
      });
    }
  }

  console.log(`Seeded organization ${organizationId} with ${LEADS.length} leads.`);
  console.log(`Operator login: ${OPERATOR_EMAIL} / (see .env.local)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
