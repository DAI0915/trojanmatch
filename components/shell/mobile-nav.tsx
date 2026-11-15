"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/logo";
import { AppNav } from "./app-nav";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open navigation"
        className="flex size-9 items-center justify-center rounded-md border bg-card hover:bg-muted lg:hidden"
      >
        <Menu className="size-4" aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetHeader className="p-0 pb-4">
          <SheetTitle>
            <Logo href="/spaces" />
          </SheetTitle>
        </SheetHeader>
        <AppNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
