"use client";

import type { HealRuleDefinition, HealRuleId, HealRuleMode } from "@/types/api";
import type { HealRulePlaceholder } from "@/lib/heal-rule-sections";
import { cn } from "@/lib/utils";

function RuleModeButtons({
  ruleId,
  mode,
  disabled,
  onSetMode,
}: {
  ruleId: HealRuleId;
  mode: HealRuleMode;
  disabled?: boolean;
  onSetMode: (id: HealRuleId, mode: HealRuleMode) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSetMode(ruleId, "auto")}
        className={cn(
          "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
          mode === "auto"
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-muted",
        )}
      >
        Auto
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSetMode(ruleId, "approval")}
        className={cn(
          "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
          mode === "approval"
            ? "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            : "border-border text-muted-foreground hover:bg-muted",
        )}
      >
        Approval
      </button>
    </div>
  );
}

export function HealRulesList({
  rules,
  placeholders = [],
  selected,
  modes,
  disabled,
  onToggle,
  onSetMode,
}: {
  rules: HealRuleDefinition[];
  placeholders?: HealRulePlaceholder[];
  selected: Set<HealRuleId>;
  modes: Partial<Record<HealRuleId, HealRuleMode>>;
  disabled?: boolean;
  onToggle: (id: HealRuleId) => void;
  onSetMode: (id: HealRuleId, mode: HealRuleMode) => void;
}) {
  return (
    <ul className="divide-y rounded-lg border">
      {rules.map((rule) => {
        const checked = selected.has(rule.id);
        const mode = modes[rule.id] ?? "auto";
        return (
          <li key={rule.id} className="px-4 py-4">
            <div className="flex items-start gap-3">
              <input
                id={`rule-${rule.id}`}
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-input"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(rule.id)}
              />
              <label
                htmlFor={`rule-${rule.id}`}
                className="min-w-0 flex-1 cursor-pointer"
              >
                <span className="text-sm font-medium">{rule.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {rule.description}
                </span>
                <span className="mt-1 inline-block font-mono text-2xs text-muted-foreground">
                  {rule.id}
                </span>
              </label>
            </div>
            {checked && (
              <div className="ml-7">
                <RuleModeButtons
                  ruleId={rule.id}
                  mode={mode}
                  disabled={disabled}
                  onSetMode={onSetMode}
                />
              </div>
            )}
          </li>
        );
      })}
      {placeholders.map((rule) => (
        <li key={rule.id} className="px-4 py-4 opacity-70">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-input"
              checked={false}
              disabled
              aria-label={`${rule.label} (coming soon)`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{rule.label}</span>
                <span className="rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Coming soon
                </span>
              </div>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {rule.description}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
