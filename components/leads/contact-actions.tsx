"use client";

import { useTransition } from "react";
import { CheckCircle2, ExternalLink, Mail, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markContactedAction } from "@/app/(dashboard)/leads/[id]/actions";
import type { LeadRecord } from "@/types/lead";

function toWhatsAppDigits(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export function ContactActions({ lead }: { lead: LeadRecord }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      {lead.phone && (
        <Button variant="outline" nativeButton={false} render={<a href={`tel:${lead.phone}`} />}>
          <Phone />
          Call
        </Button>
      )}
      {lead.phone && (
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <a
              href={`https://wa.me/${toWhatsAppDigits(lead.phone)}`}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <MessageCircle />
          WhatsApp
        </Button>
      )}
      {lead.email && (
        <Button variant="outline" nativeButton={false} render={<a href={`mailto:${lead.email}`} />}>
          <Mail />
          Email
        </Button>
      )}
      {lead.website && (
        <Button
          variant="outline"
          nativeButton={false}
          render={<a href={lead.website} target="_blank" rel="noreferrer" />}
        >
          <ExternalLink />
          Open website
        </Button>
      )}
      <Button
        disabled={isPending}
        onClick={() => startTransition(() => markContactedAction(lead.id))}
      >
        <CheckCircle2 />
        {isPending ? "Marking..." : "Mark contacted"}
      </Button>
    </div>
  );
}
