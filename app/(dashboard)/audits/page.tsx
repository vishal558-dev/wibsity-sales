import Link from "next/link";
import { SearchCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLatestAuditsForOrg } from "@/lib/audits/queries";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function statusLabel(status: string): string {
  if (status === "completed") return "Complete";
  if (status === "failed") return "Failed";
  return "In progress";
}

export default async function AuditsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user!.id)
    .single();

  const audits = await getLatestAuditsForOrg(supabase, profile!.organization_id);

  return (
    <>
      <PageHeader title="Audits" description="Website audits generated for every analyzed lead." />
      {audits.length === 0 ? (
        <EmptyState
          icon={SearchCheck}
          title="No audits yet"
          description="Run an audit from a lead's detail page to see it here."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Business</th>
                <th className="px-4 py-2 font-medium">Overall</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {audits.map((audit) => (
                <tr key={audit.id} className="hover:bg-accent">
                  <td className="px-4 py-2">
                    <Link href={`/audits/${audit.id}`} className="font-medium text-foreground hover:underline">
                      {audit.lead.business_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{audit.overall_score ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-muted-foreground">{formatDate(audit.created_at)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{statusLabel(audit.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
