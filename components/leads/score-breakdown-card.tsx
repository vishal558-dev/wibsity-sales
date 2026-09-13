"use client";

import { useTransition } from "react";
import { recalculateScoreAction } from "@/app/(dashboard)/leads/[id]/actions";
import { Button } from "@/components/ui/button";
import type { ScoreBreakdown, ScoreFactor } from "@/types/scoring";

function FactorRow({ label, factor }: { label: string; factor: ScoreFactor | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">
        {factor ? `${factor.points}/${factor.maxPoints}` : "Not yet assessed"}
      </span>
    </div>
  );
}

export function ScoreBreakdownCard({ leadId, breakdown }: { leadId: string; breakdown: ScoreBreakdown }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">SCORE BREAKDOWN</h2>
        <form action={() => startTransition(() => recalculateScoreAction(leadId))}>
          <Button type="submit" variant="outline" size="sm" disabled={isPending}>
            Recalculate
          </Button>
        </form>
      </div>
      <div className="flex flex-col gap-1.5">
        <FactorRow label="Website opportunity" factor={breakdown.websiteOpportunity} />
        <FactorRow label="Business activity" factor={breakdown.businessActivity} />
        <FactorRow label="Wibsity fit" factor={breakdown.wibsityFit} />
        <FactorRow label="Contactability" factor={breakdown.contactability} />
        <FactorRow label="Local relevance" factor={breakdown.localRelevance} />
        <FactorRow label="Other" factor={breakdown.other} />
      </div>
      <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
        <span className="text-foreground">TOTAL</span>
        <span className="text-foreground">{breakdown.overallScore}/100</span>
      </div>
    </div>
  );
}
