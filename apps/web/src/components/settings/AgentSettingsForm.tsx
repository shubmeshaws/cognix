"use client";

import { InfoTooltip } from "@/components/InfoTooltip";
import { AgentConfigRows } from "@/components/AgentConfigRows";
import { LlmProviderChain } from "@/components/settings/LlmProviderChain";
import { TeamsIntegration } from "@/components/settings/TeamsIntegration";
import { HEALING_MODE_OPTIONS } from "@/lib/agent-config-display";
import { useAgentStatus } from "@/lib/query";
import { useSettingsStore, type HealingMode } from "@/stores/settings";
import { useClusterStore } from "@/stores/cluster";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function SettingField({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium">{label}</label>
        <InfoTooltip content={tooltip} />
      </div>
      {children}
    </div>
  );
}

export function AgentSettingsForm() {
  const agentQuery = useAgentStatus();
  const wsConnected = useClusterStore((s) => s.wsConnected);
  const pendingApprovals = useClusterStore((s) => s.pendingApprovals);

  const healingMode = useSettingsStore((s) => s.healingMode);
  const setHealingMode = useSettingsStore((s) => s.setHealingMode);
  const reset = useSettingsStore((s) => s.reset);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <TeamsIntegration />

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Agent configuration</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes apply immediately on the dashboard overview. Live status rows
          (auth, watcher) still come from the running agent.
        </p>

        <div className="mt-6 space-y-6">
          <LlmProviderChain />

          <SettingField
            label="Healing mode"
            tooltip="Controls whether the agent auto-heals, always asks for approval, or only observes."
          >
            <div className="space-y-2">
              {HEALING_MODE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition-colors",
                    healingMode === opt.value
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50",
                  )}
                >
                  <input
                    type="radio"
                    name="healingMode"
                    className="mt-1"
                    checked={healingMode === opt.value}
                    onChange={() => setHealingMode(opt.value as HealingMode)}
                  />
                  <span>
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {opt.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </SettingField>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              Reset to defaults
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card shadow-sm">
        <header className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Live preview</h3>
          <p className="text-xs text-muted-foreground">
            Same summary shown on the dashboard Agent config panel
          </p>
        </header>
        <AgentConfigRows
          agent={agentQuery.data}
          pendingApprovals={pendingApprovals.length}
          wsConnected={wsConnected}
        />
      </section>
    </div>
  );
}
