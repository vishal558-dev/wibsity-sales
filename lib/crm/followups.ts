import type { SupabaseClient } from "@supabase/supabase-js";
import { createActivity } from "@/lib/crm/activities";

export function followUpLabel(nextFollowupAt: string | null): string | null {
  if (!nextFollowupAt) return null;

  const due = new Date(nextFollowupAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const daysDiff = Math.round((today.getTime() - due.getTime()) / 86_400_000);

  if (daysDiff > 0) return `${daysDiff} day${daysDiff === 1 ? "" : "s"} overdue`;
  if (daysDiff === 0) return "Follow up today";
  return "Follow up scheduled";
}

export async function markLeadContacted(supabase: SupabaseClient, leadId: string): Promise<void> {
  await supabase
    .from("leads")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", leadId);
  await createActivity(supabase, leadId, "called", "Marked as contacted");
}

export async function rescheduleFollowUp(
  supabase: SupabaseClient,
  leadId: string,
  isoDate: string,
): Promise<void> {
  await supabase.from("leads").update({ next_followup_at: isoDate }).eq("id", leadId);
  const label = new Date(isoDate).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  await createActivity(supabase, leadId, "follow_up_scheduled", `Follow-up scheduled for ${label}`);
}

export async function clearFollowUp(supabase: SupabaseClient, leadId: string): Promise<void> {
  await supabase.from("leads").update({ next_followup_at: null }).eq("id", leadId);
}
