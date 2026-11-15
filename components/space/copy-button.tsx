"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success(`${label} copied`);
        } catch {
          toast.error("Copy failed. Select the text and copy it manually.");
        }
      }}
    >
      <Copy data-icon="inline-start" aria-hidden /> Copy {label.toLowerCase()}
    </Button>
  );
}
