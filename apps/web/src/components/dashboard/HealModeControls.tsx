"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAgentToken } from "@/hooks/useAgentToken";
import { useHealingControl } from "@/hooks/useHealingControl";
import { useManualHealControl } from "@/hooks/useManualHealControl";
import { cn } from "@/lib/utils";

function ModeToggle({
  label,
  active,
  onStart,
  onStop,
  disabled,
}: {
  label: string;
  active: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border px-2 py-0.5",
        active
          ? "border-emerald-500/40 bg-emerald-50/80 dark:bg-emerald-950/30"
          : "border-border bg-muted/30",
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {active ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          disabled={disabled}
          onClick={onStop}
        >
          <Pause className="h-3 w-3" />
          Stop
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          disabled={disabled}
          onClick={onStart}
        >
          <Play className="h-3 w-3" />
          Start
        </Button>
      )}
    </div>
  );
}

export function HealModeControls() {
  const [mounted, setMounted] = useState(false);
  const token = useAgentToken();
  const { healingActive, startHealing, stopHealing } = useHealingControl();
  const { manualHealActive, startManualHeal, stopManualHeal } =
    useManualHealControl();

  useEffect(() => {
    setMounted(true);
  }, []);

  const disabled = !token || !mounted;
  const autoActive = mounted ? healingActive : false;
  const manualActive = mounted ? manualHealActive : false;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ModeToggle
        label="AutoHeal"
        active={autoActive}
        onStart={startHealing}
        onStop={stopHealing}
        disabled={disabled}
      />
      <ModeToggle
        label="ManualHeal"
        active={manualActive}
        onStart={startManualHeal}
        onStop={stopManualHeal}
        disabled={disabled}
      />

    </div>
  );
}
