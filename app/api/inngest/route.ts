import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { generateLeads } from "@/lib/inngest/functions/generate-leads";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateLeads],
});
