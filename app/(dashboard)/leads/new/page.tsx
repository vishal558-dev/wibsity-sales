import { PageHeader } from "@/components/page-header";
import { GenerationForm } from "@/components/leads/generation-form";

export default function NewLeadGenerationPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Generate leads" />
      <GenerationForm />
    </div>
  );
}
