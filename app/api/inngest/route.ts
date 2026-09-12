import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { generateLeads } from "@/lib/inngest/functions/generate-leads";
import { auditWebsite } from "@/lib/inngest/functions/audit-website";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateLeads, auditWebsite],
});
