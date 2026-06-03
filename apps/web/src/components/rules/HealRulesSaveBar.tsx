"use client";

import { ShieldCheck } from "lucide-react";

import { useHealRulesContext } from "@/components/rules/HealRulesProvider";
import { Button } from "@/components/ui/button";

export function HealRulesSaveBar() {
  const {
    activeClusterId,
    selected,
    save,
    isSaving,
    saved,
    errorMessage,
  } = useHealRulesContext();

  if (!activeClusterId) return null;

  return (
    <div className="border-t bg-card/80 px-6 py-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
          <p>
            Changes apply across all rule tabs. Choose <strong>Auto</strong> or{" "}
            <strong>Approval</strong> per issue, then save once.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {errorMessage && (
            <span className="text-xs text-red-600">{errorMessage}</span>
          )}
          {saved && (
            <span className="text-xs text-emerald-600">Rules saved.</span>
          )}
          <Button
            disabled={selected.size === 0 || isSaving}
            onClick={save}
          >
            {isSaving ? "Saving…" : "Save rules"}
          </Button>
        </div>
      </div>
    </div>
  );
}
