"use client";

import {
  groupHealRulesByCategory,
  type HealRuleCategory,
} from "@kubehealer/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAgentToken } from "@/hooks/useAgentToken";
import { updateHealRules, parseApiErrorMessage } from "@/lib/api";
import { useHealRules } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";
import type { HealRuleId, HealRuleMode } from "@/types/api";

interface HealRulesContextValue {
  activeClusterId: string | null;
  groupedRules: ReturnType<typeof groupHealRulesByCategory>;
  selected: Set<HealRuleId>;
  modes: Partial<Record<HealRuleId, HealRuleMode>>;
  concurrencyMode: "concurrent" | "sequential";
  setConcurrencyMode: (mode: "concurrent" | "sequential") => void;
  healJobPods: boolean;
  setHealJobPods: (enabled: boolean) => void;
  healWorkerPods: boolean;
  setHealWorkerPods: (enabled: boolean) => void;
  controlsDisabled: boolean;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  queryError: string | null;
  saved: boolean;
  toggle: (id: HealRuleId) => void;
  setMode: (id: HealRuleId, mode: HealRuleMode) => void;
  save: () => void;
  isSaving: boolean;
  enabledCount: (category: HealRuleCategory) => string;
}

const HealRulesContext = createContext<HealRulesContextValue | null>(null);

export function HealRulesProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const token = useAgentToken();
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const rulesQuery = useHealRules();
  const [selected, setSelected] = useState<Set<HealRuleId>>(new Set());
  const [modes, setModes] = useState<Partial<Record<HealRuleId, HealRuleMode>>>(
    {},
  );
  const [concurrencyMode, setConcurrencyMode] = useState<
    "concurrent" | "sequential"
  >("concurrent");
  const [healJobPods, setHealJobPods] = useState(false);
  const [healWorkerPods, setHealWorkerPods] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (rulesQuery.data?.enabled) {
      setSelected(new Set(rulesQuery.data.enabled));
      setModes(rulesQuery.data.modes ?? {});
      setConcurrencyMode(rulesQuery.data.concurrencyMode ?? "concurrent");
      setHealJobPods(rulesQuery.data.healJobPods ?? false);
      setHealWorkerPods(rulesQuery.data.healWorkerPods ?? true);
    }
  }, [
    rulesQuery.data?.enabled,
    rulesQuery.data?.modes,
    rulesQuery.data?.concurrencyMode,
    rulesQuery.data?.healJobPods,
    rulesQuery.data?.healWorkerPods,
  ]);

  const groupedRules = useMemo(
    () => groupHealRulesByCategory(rulesQuery.data?.catalog ?? []),
    [rulesQuery.data?.catalog],
  );

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
        healJobPods,
        healWorkerPods,
      });
    },
    onSuccess: () => {
      setError(null);
      setSaved(true);
      void queryClient.invalidateQueries({
        queryKey: ["heal-rules", activeClusterId],
      });
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

  const updateHealJobPods = (enabled: boolean) => {
    setSaved(false);
    setHealJobPods(enabled);
  };

  const updateHealWorkerPods = (enabled: boolean) => {
    setSaved(false);
    setHealWorkerPods(enabled);
  };

  const enabledCount = (category: HealRuleCategory) => {
    const rules = groupedRules[category];
    const enabled = rules.filter((rule) => selected.has(rule.id)).length;
    return rules.length > 0 ? `${enabled}/${rules.length}` : "0/0";
  };

  const value: HealRulesContextValue = {
    activeClusterId,
    groupedRules,
    selected,
    modes,
    concurrencyMode,
    setConcurrencyMode,
    healJobPods,
    setHealJobPods: updateHealJobPods,
    healWorkerPods,
    setHealWorkerPods: updateHealWorkerPods,
    controlsDisabled: !activeClusterId || saveMutation.isPending,
    isLoading: rulesQuery.isLoading,
    isError: rulesQuery.isError,
    errorMessage: error,
    queryError: rulesQuery.isError
      ? parseApiErrorMessage(rulesQuery.error)
      : null,
    saved,
    toggle,
    setMode,
    save: () => saveMutation.mutate(),
    isSaving: saveMutation.isPending,
    enabledCount,
  };

  return (
    <HealRulesContext.Provider value={value}>{children}</HealRulesContext.Provider>
  );
}

export function useHealRulesContext() {
  const ctx = useContext(HealRulesContext);
  if (!ctx) {
    throw new Error("useHealRulesContext must be used within HealRulesProvider");
  }
  return ctx;
}
