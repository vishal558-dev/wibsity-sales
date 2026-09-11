"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { markLeadContacted, rescheduleFollowUp, clearFollowUp } from "@/lib/crm/followups";
import { addNote } from "@/lib/crm/leads";

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
