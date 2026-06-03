"use client";

import {
  DEFAULT_MESHY_CHAT_RETENTION,
  useSettingsStore,
  type MeshyChatRetentionUnit,
} from "@/stores/settings";
import { formatMeshyChatRetention } from "@/lib/meshy-chat-storage";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Sparkles } from "lucide-react";

const RETENTION_UNITS: { value: MeshyChatRetentionUnit; label: string }[] = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
];

const RETENTION_PRESETS = [
  { value: 30, unit: "minutes" as const },
  { value: 1, unit: "hours" as const },
  { value: 24, unit: "hours" as const },
  { value: 7, unit: "days" as const },
];

export function MeshyChatSettings() {
  const meshyChatRetention = useSettingsStore((s) => s.meshyChatRetention);
  const setMeshyChatRetention = useSettingsStore((s) => s.setMeshyChatRetention);

  return (
    <SettingsSection
      title="Meshy chat"
      description="Control how long Meshy conversation history is kept on this device."
      tooltip="Meshy chat history is saved in your browser per cluster. Older messages are removed automatically after this period."
      icon={<Sparkles className="h-5 w-5 text-violet-500" />}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Save conversations for</label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={1}
              className="w-24 rounded-md border bg-background px-3 py-2 text-sm"
              value={meshyChatRetention.value}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value) || value < 1) return;
                setMeshyChatRetention({
                  ...meshyChatRetention,
                  value: Math.floor(value),
                });
              }}
            />
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={meshyChatRetention.unit}
              onChange={(event) =>
                setMeshyChatRetention({
                  ...meshyChatRetention,
                  unit: event.target.value as MeshyChatRetentionUnit,
                })
              }
            >
              {RETENTION_UNITS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Currently: conversations saved for{" "}
            <span className="font-medium text-foreground">
              {formatMeshyChatRetention(meshyChatRetention)}
            </span>
            .
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Quick presets</p>
          <div className="flex flex-wrap gap-2">
            {RETENTION_PRESETS.map((preset) => {
              const active =
                meshyChatRetention.value === preset.value &&
                meshyChatRetention.unit === preset.unit;
              return (
                <button
                  key={`${preset.value}-${preset.unit}`}
                  type="button"
                  onClick={() => setMeshyChatRetention(preset)}
                  className={
                    active
                      ? "rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                      : "rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
                  }
                >
                  {formatMeshyChatRetention(preset)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setMeshyChatRetention(DEFAULT_MESHY_CHAT_RETENTION)}
              className="rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50"
            >
              Reset default
            </button>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
