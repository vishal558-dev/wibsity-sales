"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { markLeadContacted, rescheduleFollowUp, clearFollowUp } from "@/lib/crm/followups";
import { addNote } from "@/lib/crm/leads";
import { inngest } from "@/lib/inngest/client";

export async function markContactedAction(leadId: string) {
  const supabase = await createClient();
  await markLeadContacted(supabase, leadId);
  revalidatePath(`/leads/${leadId}`);
}

export async function addNoteAction(leadId: string, formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;
  const supabase = await createClient();
  await addNote(supabase, leadId, content);
  revalidatePath(`/leads/${leadId}`);
}

export async function rescheduleFollowUpAction(leadId: string, formData: FormData) {
  const date = String(formData.get("date") ?? "");
  if (!date) return;
  const supabase = await createClient();
  await rescheduleFollowUp(supabase, leadId, new Date(date).toISOString());
  revalidatePath(`/leads/${leadId}`);
}

export async function clearFollowUpAction(leadId: string) {
  const supabase = await createClient();
  await clearFollowUp(supabase, leadId);
  revalidatePath(`/leads/${leadId}`);
}

export async function runAuditAction(leadId: string) {
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("id, website").eq("id", leadId).maybeSingle();
  if (!lead?.website) return;

  const { data: audit, error } = await supabase
    .from("website_audits")
    .insert({ lead_id: leadId, status: "pending" })
    .select("id")
    .single();
  if (error || !audit) return;

  await inngest.send({ name: "audits/website.requested", data: { auditId: audit.id } });
  revalidatePath(`/leads/${leadId}`);
}

export async function retryAuditAction(auditId: string, leadId: string) {
  const supabase = await createClient();
  const { data: audit } = await supabase
    .from("website_audits")
    .select("id, status")
    .eq("id", auditId)
    .maybeSingle();
  if (!audit || audit.status !== "failed") return;

  await supabase.from("website_audits").update({ status: "pending", error: null }).eq("id", auditId);
  await inngest.send({ name: "audits/website.requested", data: { auditId } });
  revalidatePath(`/leads/${leadId}`);
}
