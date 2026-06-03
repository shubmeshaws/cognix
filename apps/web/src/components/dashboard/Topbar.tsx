"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { HealModeControls } from "@/components/dashboard/HealModeControls";
import { MeshyAIToggle } from "@/components/MeshyAIToggle";

export function Topbar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 border-b bg-background px-6 py-4">
      <h1 className="font-heading text-xl font-semibold tracking-tight">
        {title}
      </h1>
      <div className="flex flex-wrap items-center gap-3">
        <ThemeToggle />
        <MeshyAIToggle />
        <HealModeControls />
      </div>
    </header>
  );
}
