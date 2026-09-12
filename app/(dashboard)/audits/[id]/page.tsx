import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuditById, getIssuesForAudit } from "@/lib/audits/queries";
import { PageHeader } from "@/components/page-header";
import type { AuditCategory, AuditIssue } from "@/types/audit";

function ScoreRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value ?? "Not measured"}</span>
    </div>
  );
}

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  seo: "SEO",
  mobile: "Mobile",
  conversion: "Conversion",
  technical: "Technical",
};

function groupByCategory(issues: AuditIssue[]): [AuditCategory, AuditIssue[]][] {
  const groups = new Map<AuditCategory, AuditIssue[]>();
  for (const issue of issues) {
    const list = groups.get(issue.category) ?? [];
    list.push(issue);
    groups.set(issue.category, list);
  }
  return Array.from(groups.entries());
}

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const audit = await getAuditById(supabase, id);
  if (!audit) notFound();

  const issues = await getIssuesForAudit(supabase, id);
  const talkingPoints = (audit.raw_results as { talking_points?: string[] } | null)?.talking_points ?? [];

  return (
    <>
      <PageHeader
        title={audit.lead.business_name}
        description="Website audit scores, findings, and recommendations."
        actions={
          <Link href={`/leads/${audit.lead.id}`} className="text-sm text-primary hover:underline">
            View lead
          </Link>
        }
      />

      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium text-muted-foreground">SCORES</h2>
        <ScoreRow label="Overall" value={audit.overall_score} />
        <ScoreRow label="Performance" value={audit.performance_score} />
        <ScoreRow label="Mobile UX" value={audit.mobile_score} />
        <ScoreRow label="SEO" value={audit.seo_score} />
        <ScoreRow label="Conversion" value={audit.conversion_score} />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium text-muted-foreground">AI SUMMARY</h2>
        <p className="text-sm text-foreground">{audit.summary}</p>
      </div>

      {talkingPoints.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium text-muted-foreground">CALL TALKING POINTS</h2>
          <ul className="list-disc pl-5 text-sm text-foreground">
            {talkingPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <h2 className="text-sm font-medium text-muted-foreground">TECHNICAL FINDINGS</h2>
        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No issues were found.</p>
        ) : (
          groupByCategory(issues).map(([category, categoryIssues]) => (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                {CATEGORY_LABEL[category] ?? category}
              </h3>
              <ul className="flex flex-col gap-3">
                {categoryIssues.map((issue) => (
                  <li key={issue.id} className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">{issue.title}</span>
                    <span className="text-sm text-muted-foreground">{issue.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </>
  );
}
