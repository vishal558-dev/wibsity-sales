"use client";

import Link from "next/link";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { runAuditAction, retryAuditAction } from "@/app/(dashboard)/leads/[id]/actions";
import { Button } from "@/components/ui/button";
import type { WebsiteAudit } from "@/types/audit";

const POLL_INTERVAL_MS = 1500;

function ScoreRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value ?? "Not measured"}</span>
    </div>
  );
}

export function AuditCard({
  leadId,
  website,
  audit,
}: {
  leadId: string;
  website: string | null;
  audit: WebsiteAudit | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const inProgress = audit?.status === "pending" || audit?.status === "processing";

  useEffect(() => {
    if (!audit || !inProgress) return;
    const supabase = createClient();
    let stopped = false;

    async function poll() {
      const { data } = await supabase.from("website_audits").select("status").eq("id", audit!.id).maybeSingle();
      if (stopped || !data) return;
      if (data.status !== "pending" && data.status !== "processing") {
        stopped = true;
        clearInterval(interval);
        router.refresh();
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [audit, inProgress, router]);

  if (!website) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">WEBSITE AUDIT</h2>
        {audit && audit.status === "completed" && (
          <Link href={`/audits/${audit.id}`} className="text-sm text-primary hover:underline">
            View full audit
          </Link>
        )}
      </div>

      {!audit && (
        <form action={() => startTransition(() => runAuditAction(leadId))}>
          <Button type="submit" size="sm" disabled={isPending}>
            Run audit
          </Button>
        </form>
      )}

      {audit && inProgress && <p className="text-sm text-muted-foreground">Auditing website...</p>}

      {audit && audit.status === "failed" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-destructive">{audit.error ?? "Website audit failed."}</p>
          <form action={() => startTransition(() => retryAuditAction(audit.id, leadId))}>
            <Button type="submit" size="sm" disabled={isPending}>
              Retry
            </Button>
          </form>
        </div>
      )}

      {audit && audit.status === "completed" && (
        <>
          <div className="flex flex-col gap-1.5">
            <ScoreRow label="Overall" value={audit.overall_score} />
            <ScoreRow label="Performance" value={audit.performance_score} />
            <ScoreRow label="Mobile UX" value={audit.mobile_score} />
            <ScoreRow label="SEO" value={audit.seo_score} />
            <ScoreRow label="Conversion" value={audit.conversion_score} />
          </div>
          <p className="text-sm text-foreground">{audit.summary}</p>
          <form action={() => startTransition(() => runAuditAction(leadId))}>
            <Button type="submit" variant="outline" size="sm" disabled={isPending}>
              Re-run audit
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
