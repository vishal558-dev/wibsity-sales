import type { LeadRecord } from "@/types/lead";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value ?? "—"}</span>
    </div>
  );
}

export function ContactInfoCard({ lead }: { lead: LeadRecord }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h2 className="text-sm font-medium text-muted-foreground">CONTACT</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Phone" value={lead.phone} />
        <Field label="Email" value={lead.email} />
        <Field label="Website" value={lead.website} />
        <Field label="Source" value={lead.source} />
        <Field
          label="Location"
          value={[lead.city, lead.state].filter(Boolean).join(", ") || null}
        />
      </div>
    </div>
  );
}
