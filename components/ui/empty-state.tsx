import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <Icon className="mb-3 size-6 text-muted-foreground" aria-hidden />
      <h2 className="font-medium">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
