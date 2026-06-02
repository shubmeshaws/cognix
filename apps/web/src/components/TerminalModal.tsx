"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import { Terminal, type TerminalProps } from "@/components/Terminal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TerminalModal({
  open,
  onClose,
  title = "Agent terminal",
  ...terminalProps
}: TerminalProps & {
  open: boolean;
  onClose: () => void;
  title?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button type="button" variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </header>
      <div className={cn("min-h-0 flex-1 p-4")}>
        <Terminal
          {...terminalProps}
          heightClassName="h-full min-h-[60vh]"
          className="h-full rounded-lg border overflow-hidden"
        />
      </div>
    </div>
  );
}
