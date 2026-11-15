"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthFormState } from "./actions";

type Field = { name: string; label: string; type: string; autoComplete: string };

export function AuthForm({
  action,
  fields,
  submitLabel,
  hidden,
}: {
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  fields: Field[];
  submitLabel: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <Label htmlFor={f.name}>{f.label}</Label>
          <Input id={f.name} name={f.name} type={f.type} autoComplete={f.autoComplete} required />
        </div>
      ))}
      {state.error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
          {state.notice}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />}
        {submitLabel}
      </Button>
    </form>
  );
}
