"use client";

import { Mic, MicOff } from "lucide-react";
import { useMeshy } from "@/stores/meshy";
import { cn } from "@/lib/utils";

export function MeshyAIToggle() {
  const { enabled, toggle } = useMeshy();

  return (
    <button
      type="button"
      onClick={toggle}
      title={enabled ? "MeshyAI ON — click to disable" : "MeshyAI OFF — click to enable"}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-all",
        enabled
          ? "border-violet-500/40 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/50"
          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60",
      )}
    >
      {enabled ? (
        <>
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
          </span>
          <Mic className="h-3 w-3" />
          MeshyAI
        </>
      ) : (
        <>
          <MicOff className="h-3 w-3" />
          MeshyAI
        </>
      )}
    </button>
  );
}
