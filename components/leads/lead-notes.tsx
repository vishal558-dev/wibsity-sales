"use client";

import { useRef } from "react";
import type { LeadNote } from "@/types/lead";
import { addNoteAction } from "@/app/(dashboard)/leads/[id]/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export function LeadNotes({ leadId, notes }: { leadId: string; notes: LeadNote[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const boundAddNote = addNoteAction.bind(null, leadId);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">NOTES</h2>
      <form
        ref={formRef}
        action={async (formData) => {
          await boundAddNote(formData);
          formRef.current?.reset();
        }}
        className="flex flex-col gap-2"
      >
        <Field>
          <FieldLabel htmlFor="content" className="sr-only">
            Add note
          </FieldLabel>
          <textarea
            id="content"
            name="content"
            placeholder="Add note..."
            rows={2}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Field>
        <Button type="submit" size="sm" className="self-end">
          Add note
        </Button>
      </form>
      <ul className="flex flex-col gap-2">
        {notes.map((note) => (
          <li key={note.id} className="rounded-lg border border-border p-3">
            <p className="text-sm text-foreground">{note.content}</p>
            <p className="mt-1 text-sm text-muted-foreground">{formatDate(note.created_at)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
