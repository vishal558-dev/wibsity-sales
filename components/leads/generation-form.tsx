"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitGenerationAction, type GenerationFormState } from "@/app/(dashboard)/leads/new/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

const initialState: GenerationFormState = { error: null, fieldErrors: {} };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Starting..." : "Generate leads"}
    </Button>
  );
}

export function GenerationForm() {
  const [state, formAction] = useActionState(submitGenerationAction, initialState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="industry">Industry</FieldLabel>
        <Input id="industry" name="industry" placeholder="Solar companies" />
        {state.fieldErrors.industry && (
          <p className="text-sm text-destructive">{state.fieldErrors.industry[0]}</p>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="location">Location</FieldLabel>
        <Input id="location" name="location" placeholder="Noida" />
        {state.fieldErrors.location && (
          <p className="text-sm text-destructive">{state.fieldErrors.location[0]}</p>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="requestedCount">Number of leads</FieldLabel>
        <Input id="requestedCount" name="requestedCount" type="number" min={1} max={100} defaultValue={50} />
        {state.fieldErrors.requestedCount && (
          <p className="text-sm text-destructive">{state.fieldErrors.requestedCount[0]}</p>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="minRating">Minimum rating</FieldLabel>
        <Input id="minRating" name="minRating" type="number" min={0} max={5} step={0.1} placeholder="3.5" />
        {state.fieldErrors.minRating && (
          <p className="text-sm text-destructive">{state.fieldErrors.minRating[0]}</p>
        )}
      </Field>

      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input type="checkbox" name="websiteRequired" defaultChecked />
        Website required
      </label>

      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input type="checkbox" name="phoneRequired" defaultChecked />
        Only businesses with phone
      </label>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <SubmitButton />
    </form>
  );
}
