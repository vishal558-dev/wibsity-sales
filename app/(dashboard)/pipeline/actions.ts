"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { updateLeadPipelineStage } from "@/lib/crm/pipeline";

export async function moveLeadToStageAction(
  leadId: string,
  stageId: string,
  stageName: string,
) {
  const supabase = await createClient();
  await updateLeadPipelineStage(supabase, leadId, { id: stageId, name: stageName });
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
}
