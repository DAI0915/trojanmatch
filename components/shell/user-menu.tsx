import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export function UserMenu({ name, synthetic }: { name: string; synthetic: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <Avatar className="size-8">
        <AvatarFallback>{initials || "?"}</AvatarFallback>
      </Avatar>
      <div className="hidden min-w-0 flex-col sm:flex">
        <span className="max-w-40 truncate text-sm font-medium">{name}</span>
        {synthetic && (
          <Badge variant="outline" className="h-4 w-fit px-1 text-[10px]">
            Synthetic demo user
          </Badge>
        )}
      </div>
      <form action="/auth/sign-out" method="post">
        <button
          type="submit"
          aria-label="Sign out"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden />
        </button>
      </form>
    </div>
  );
}
