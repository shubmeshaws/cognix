"use client";

import { SettingsSection } from "@/components/settings/SettingsSection";
import { HEALING_MODE_OPTIONS } from "@/lib/agent-config-display";
import { useSettingsStore, type HealingMode } from "@/stores/settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HealingModeSettings() {
  const healingMode = useSettingsStore((s) => s.healingMode);
  const setHealingMode = useSettingsStore((s) => s.setHealingMode);
  const reset = useSettingsStore((s) => s.reset);

  return (
    <SettingsSection
      title="Healing mode"
      description="Control how the agent responds when it detects pod issues."
      tooltip="Autonomous mode can heal automatically; approval required waits for your OK; observe only logs without acting."
    >
      <div className="space-y-2">
        {HEALING_MODE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition-colors",
              healingMode === option.value
                ? "border-primary bg-primary/5"
                : "hover:bg-muted/50",
            )}
          >
            <input
              type="radio"
              name="healingMode"
              className="mt-1"
              checked={healingMode === option.value}
              onChange={() => setHealingMode(option.value as HealingMode)}
            />
            <span>
              <span className="text-sm font-medium">{option.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3 border-t pt-4">
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          Reset all settings to defaults
        </Button>
        <span className="text-xs text-muted-foreground">
          Resets browser settings only — use Apply to agent for LLM changes.
        </span>
      </div>
    </SettingsSection>
  );
}
