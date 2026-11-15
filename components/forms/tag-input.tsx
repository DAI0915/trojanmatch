"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { normalizeCustomTag } from "@/lib/taxonomy";
import { inputClass } from "./field";

/** Free-text tags added alongside structured choices (spec §3.1 "自由追加"). */
export function TagInput({
  id,
  value,
  onChange,
  isKnown,
  max,
  placeholder,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  isKnown: (t: string) => boolean;
  max: number;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const custom = value.filter((v) => !isKnown(v));

  const add = () => {
    const tag = normalizeCustomTag(draft);
    if (!tag) {
      setError("Use 1–30 letters, numbers or + # . / -");
      return;
    }
    if (value.length >= max) {
      setError(`At most ${max}`);
      return;
    }
    if (!value.includes(tag)) onChange([...value, tag]);
    setDraft("");
    setError(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={30}
          aria-invalid={!!error}
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
        >
          <Plus className="size-4" aria-hidden /> Add
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {custom.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Custom tags">
          {custom.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-0.5 text-sm text-primary">
              {t}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== t))}
                aria-label={`Remove ${t}`}
                className="rounded-full p-0.5 hover:bg-primary/20"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
