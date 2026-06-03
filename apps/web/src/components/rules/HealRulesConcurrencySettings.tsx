"use client";

import { SettingsSection } from "@/components/settings/SettingsSection";
import { useHealRulesContext } from "@/components/rules/HealRulesProvider";
import { cn } from "@/lib/utils";

export function HealRulesConcurrencySettings() {
  const { concurrencyMode, setConcurrencyMode, controlsDisabled } =
    useHealRulesContext();

  return (
    <SettingsSection
      title="Heal concurrency"
      description="Controls how the agent handles multiple failing pods across the cluster at the same time."
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <label
          className={cn(
            "flex flex-1 cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
            concurrencyMode === "concurrent"
              ? "border-primary bg-primary/5"
              : "hover:bg-muted",
          )}
        >
          <input
            type="radio"
            name="concurrencyMode"
            className="mt-1 h-4 w-4 border-input"
            checked={concurrencyMode === "concurrent"}
            disabled={controlsDisabled}
            onChange={() => setConcurrencyMode("concurrent")}
          />
          <div>
            <span className="block text-sm font-medium">Heal multiple (concurrent)</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Heal multiple deployments simultaneously. Recommended for most clusters.
            </span>
          </div>
        </label>
        <label
          className={cn(
            "flex flex-1 cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
            concurrencyMode === "sequential"
              ? "border-primary bg-primary/5"
              : "hover:bg-muted",
          )}
        >
          <input
            type="radio"
            name="concurrencyMode"
            className="mt-1 h-4 w-4 border-input"
            checked={concurrencyMode === "sequential"}
            disabled={controlsDisabled}
            onChange={() => setConcurrencyMode("sequential")}
          />
          <div>
            <span className="block text-sm font-medium">One by one (sequential)</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Enforce one active heal operation at a time for the entire cluster. Safest mode.
            </span>
          </div>
        </label>
      </div>
    </SettingsSection>
  );
}
