"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearFollowUpAction, rescheduleFollowUpAction } from "@/app/(dashboard)/leads/[id]/actions";
import { followUpLabel } from "@/lib/crm/followups";

export function FollowUpCard({
  leadId,
  nextFollowupAt,
}: {
  leadId: string;
  nextFollowupAt: string | null;
}) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [date, setDate] = useState("");
  const [isPending, startTransition] = useTransition();
  const boundReschedule = rescheduleFollowUpAction.bind(null, leadId);

  const label = followUpLabel(nextFollowupAt) ?? "No follow-up scheduled";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h2 className="text-sm font-medium text-muted-foreground">FOLLOW-UP</h2>
      <p className="text-sm text-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        {nextFollowupAt && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => startTransition(() => clearFollowUpAction(leadId))}
          >
            Mark done
          </Button>
        )}
        {showReschedule ? (
          <form
            action={(formData) => startTransition(() => boundReschedule(formData))}
            className="flex items-center gap-2"
          >
            <Input
              type="date"
              name="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 w-auto"
              aria-label="Follow-up date"
            />
            <Button type="submit" size="sm" disabled={isPending || !date}>
              Save
            </Button>
          </form>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowReschedule(true)}>
            Reschedule
          </Button>
        )}
      </div>
    </div>
  );
}
