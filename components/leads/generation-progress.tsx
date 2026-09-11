"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { retryGenerationAction } from "@/app/(dashboard)/leads/new/actions";
import { Button } from "@/components/ui/button";
import type { GenerationJob } from "@/types/generation";

const POLL_INTERVAL_MS = 1500;
const JOB_COLUMNS = "id, status, progress, found_count, analyzed_count, qualified_count, duplicate_count, error";

type JobProgress = Pick<
  GenerationJob,
  "id" | "status" | "progress" | "found_count" | "analyzed_count" | "qualified_count" | "duplicate_count" | "error"
>;

export function GenerationProgress({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<JobProgress | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let stopped = false;

    async function poll() {
      const { data } = await supabase.from("generation_jobs").select(JOB_COLUMNS).eq("id", jobId).maybeSingle();
      if (stopped || !data) return;

      const current = data as unknown as JobProgress;
      setJob(current);
      if (current.status === "completed" || current.status === "failed") {
        stopped = true;
        clearInterval(interval);
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    poll();

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [jobId]);

  if (!job) return <p className="text-sm text-muted-foreground">Loading...</p>;

  if (job.status === "failed") {
    return (
      <div className="flex max-w-md flex-col gap-3">
        <p className="text-sm text-destructive">{job.error ?? "Lead generation failed."}</p>
        <form action={retryGenerationAction.bind(null, jobId)}>
          <Button type="submit" size="sm">
            Retry
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex max-w-md flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {job.status === "completed" ? "Done." : "Finding businesses..."}
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${job.progress}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Found</dt>
        <dd className="text-right font-medium">{job.found_count}</dd>
        <dt className="text-muted-foreground">Analyzed</dt>
        <dd className="text-right font-medium">{job.analyzed_count}</dd>
        <dt className="text-muted-foreground">Qualified</dt>
        <dd className="text-right font-medium">{job.qualified_count}</dd>
        <dt className="text-muted-foreground">Duplicates</dt>
        <dd className="text-right font-medium">{job.duplicate_count}</dd>
      </dl>
    </div>
  );
}
