"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Topbar } from "@/components/dashboard/Topbar";
import { Button } from "@/components/ui/button";
import { useAgentToken } from "@/hooks/useAgentToken";
import { updateHealRules, parseApiErrorMessage } from "@/lib/api";
import { useHealRules } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";
import type { HealRuleId, HealRuleMode } from "@/types/api";
import { cn } from "@/lib/utils";

export default function RulesPage() {
  const queryClient = useQueryClient();
  const token = useAgentToken();
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const rulesQuery = useHealRules();
  const [selected, setSelected] = useState<Set<HealRuleId>>(new Set());
  const [modes, setModes] = useState<Partial<Record<HealRuleId, HealRuleMode>>>(
    {},
  );
  const [concurrencyMode, setConcurrencyMode] = useState<"concurrent" | "sequential">("concurrent");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (rulesQuery.data?.enabled) {
      setSelected(new Set(rulesQuery.data.enabled));
      setModes(rulesQuery.data.modes ?? {});
      setConcurrencyMode(rulesQuery.data.concurrencyMode ?? "concurrent");
    }
  }, [rulesQuery.data?.enabled, rulesQuery.data?.modes, rulesQuery.data?.concurrencyMode]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!token || !activeClusterId) throw new Error("No cluster selected");
      const enabled = [...selected];
      const modesPayload = Object.fromEntries(
        enabled.map((id) => [id, modes[id] ?? "auto"]),
      ) as Record<HealRuleId, HealRuleMode>;
      return updateHealRules(token, activeClusterId, {
        enabled,
        modes: modesPayload,
        concurrencyMode,
      });
    },
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["heal-rules", activeClusterId] });
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => setError(parseApiErrorMessage(err)),
  });

  const toggle = (id: HealRuleId) => {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev;
        next.delete(id);
        setModes((m) => {
          const copy = { ...m };
          delete copy[id];
          return copy;
        });
      } else {
        next.add(id);
        setModes((m) => ({ ...m, [id]: m[id] ?? "auto" }));
      }
      return next;
    });
  };

  const setMode = (id: HealRuleId, mode: HealRuleMode) => {
    setSaved(false);
    setModes((m) => ({ ...m, [id]: mode }));
  };

  const catalog = rulesQuery.data?.catalog ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar title="Heal rules" />

      <div className="flex-1 space-y-6 p-6">
        {!activeClusterId && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Select a cluster in the sidebar to configure which issues the healer
            will act on.
          </p>
        )}

        {activeClusterId && (
          <>
            <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Active heal rules</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enable issue types for this cluster. Choose <strong>Auto</strong>{" "}
                  to heal immediately (e.g. OOM), or <strong>Approval</strong> to
                  show the approval card on the dashboard first (e.g. ImagePull).
                  AutoHeal and ManualHeal both use these rules. Click{" "}
                  <strong>Save rules</strong> to apply.
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-4 space-y-4">
              <div>
                <h3 className="text-sm font-medium">Heal Concurrency</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Controls how the agent handles multiple failing pods across the cluster at the same time.
                </p>
              </div>
              <div className="flex gap-4">
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
                    onChange={() => setConcurrencyMode("concurrent")}
                  />
                  <div>
                    <span className="block text-sm font-medium">Heal Multiple (Concurrent)</span>
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
                    onChange={() => setConcurrencyMode("sequential")}
                  />
                  <div>
                    <span className="block text-sm font-medium">One by One (Sequential)</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Enforce one active heal operation at a time for the entire cluster. Safest mode.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {rulesQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Loading rules…</p>
            )}

            {rulesQuery.isError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {parseApiErrorMessage(rulesQuery.error)}
              </p>
            )}

            <ul className="divide-y rounded-lg border bg-card">
              {catalog.map((rule) => {
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
                        disabled={!activeClusterId || saveMutation.isPending}
                        onChange={() => toggle(rule.id)}
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
                      <div className="mt-3 ml-7 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={saveMutation.isPending}
                          onClick={() => setMode(rule.id, "auto")}
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
                          disabled={saveMutation.isPending}
                          onClick={() => setMode(rule.id, "approval")}
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
                    )}
                  </li>
                );
              })}
            </ul>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button
                disabled={
                  !activeClusterId ||
                  selected.size === 0 ||
                  saveMutation.isPending
                }
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? "Saving…" : "Save rules"}
              </Button>
              {saved && (
                <span className="text-sm text-emerald-600">Rules saved.</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
