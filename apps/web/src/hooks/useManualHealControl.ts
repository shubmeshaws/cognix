"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useAgentToken } from "@/hooks/useAgentToken";
import { setAgentManualHealEnabled } from "@/lib/api";
import { useAgentStatus } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";
import type { AgentStatus } from "@/types/api";

const STORAGE_KEY = "kubehealer-manual-heal-enabled";

function persistManualHealEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

/** Manual heal mode — per-pod Heal buttons in Pod health table. */
export function useManualHealControl() {
  const token = useAgentToken();
  const queryClient = useQueryClient();
  const agentQuery = useAgentStatus();
  const manualHealOverride = useClusterStore((s) => s.manualHealEnabledOverride);
  const setManualHealOverride = useClusterStore(
    (s) => s.setManualHealEnabledOverride,
  );

  const serverEnabled = agentQuery.data?.manualHealEnabled;
  const manualHealActive = manualHealOverride ?? serverEnabled ?? false;

  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!token) throw new Error("Not signed in");
      return setAgentManualHealEnabled(token, enabled);
    },
    onMutate: (enabled) => {
      const previous = queryClient.getQueryData<AgentStatus>(["agent-status"]);
      if (previous) {
        queryClient.setQueryData<AgentStatus>(["agent-status"], {
          ...previous,
          manualHealEnabled: enabled,
        });
      }
      return { previous };
    },
    onSuccess: (res) => {
      queryClient.setQueryData<AgentStatus>(["agent-status"], (old) =>
        old ? { ...old, manualHealEnabled: res.manualHealEnabled } : old,
      );
      setManualHealOverride(null);
      persistManualHealEnabled(res.manualHealEnabled);
    },
    onError: (_err, enabled, context) => {
      setManualHealOverride(null);
      if (context?.previous) {
        queryClient.setQueryData(["agent-status"], context.previous);
        if (context.previous.manualHealEnabled !== undefined) {
          persistManualHealEnabled(context.previous.manualHealEnabled);
        }
      } else {
        persistManualHealEnabled(enabled);
      }
    },
  });

  const applyEnabled = useCallback(
    (enabled: boolean) => {
      if (!token) return;
      setManualHealOverride(enabled);
      persistManualHealEnabled(enabled);
      mutation.mutate(enabled);
    },
    [token, mutation, setManualHealOverride],
  );

  const startManualHeal = useCallback(() => {
    if (!manualHealActive) applyEnabled(true);
  }, [manualHealActive, applyEnabled]);

  const stopManualHeal = useCallback(() => {
    if (manualHealActive) applyEnabled(false);
  }, [manualHealActive, applyEnabled]);

  return {
    manualHealActive,
    startManualHeal,
    stopManualHeal,
    toggling: mutation.isPending,
  };
}
