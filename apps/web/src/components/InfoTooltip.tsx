"use client";

import { HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export function InfoTooltip({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      <button
        type="button"
        className="inline-flex rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="More information"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-56 -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-left text-xs font-normal leading-snug text-popover-foreground shadow-md group-hover:block group-focus-within:block"
      >
        {content}
      </span>
    </span>
  );
}
