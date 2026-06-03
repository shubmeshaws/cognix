"use client";

import { Briefcase } from "lucide-react";

import { useHealRulesContext } from "@/components/rules/HealRulesProvider";
import { cn } from "@/lib/utils";

function ToggleSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-60",
        checked ? "bg-violet-600" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

export function HealRulesJobPodsToggle() {
  const { healJobPods, setHealJobPods, controlsDisabled } = useHealRulesContext();

  return (
    <div className="rounded-lg border px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-violet-500" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Heal job pods</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              When enabled, the pod rules above also apply to Kubernetes Job,
              CronJob, and ScaledJob pods. Deployments and workers are always
              covered by pod rules — this toggle does not affect them.
            </p>
          </div>
        </div>
        <ToggleSwitch
          checked={healJobPods}
          disabled={controlsDisabled}
          onChange={() => setHealJobPods(!healJobPods)}
          label="Heal job pods"
        />
      </div>
    </div>
  );
}
