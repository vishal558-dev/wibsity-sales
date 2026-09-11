import { PageHeader } from "@/components/page-header";
import { GenerationForm } from "@/components/leads/generation-form";
import { GenerationProgress } from "@/components/leads/generation-progress";

export default async function NewLeadGenerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const jobId = params.job;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Generate leads" />
      {jobId ? <GenerationProgress jobId={jobId} /> : <GenerationForm />}
    </div>
  );
}
