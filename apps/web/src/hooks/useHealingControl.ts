"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useAgentToken } from "@/hooks/useAgentToken";
import { setAgentHealingPaused } from "@/lib/api";
import { useAgentStatus } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";
import type { AgentStatus } from "@/types/api";

const STORAGE_KEY = "kubehealer-healing-active";

function persistHealingActive(active: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(active));
}

/** Dashboard healing on/off — instant override + agent API. */
export function useHealingControl() {
  const token = useAgentToken();
  const queryClient = useQueryClient();
  const agentQuery = useAgentStatus();
  const healingPausedOverride = useClusterStore((s) => s.healingPausedOverride);
  const setHealingPausedOverride = useClusterStore(
    (s) => s.setHealingPausedOverride,
  );

  const serverPaused = agentQuery.data?.healingPaused;
  const effectivePaused =
    healingPausedOverride ?? serverPaused ?? false;
  const healingActive = !effectivePaused;

  const mutation = useMutation({
    mutationFn: async (paused: boolean) => {
      if (!token) throw new Error("Not signed in");
      return setAgentHealingPaused(token, paused);
    },
    onMutate: (paused) => {
      const previous = queryClient.getQueryData<AgentStatus>(["agent-status"]);
      if (previous) {
        queryClient.setQueryData<AgentStatus>(["agent-status"], {
          ...previous,
          healingPaused: paused,
        });
      }
      return { previous };
    },
    onSuccess: (res) => {
      queryClient.setQueryData<AgentStatus>(["agent-status"], (old) =>
        old ? { ...old, healingPaused: res.healingPaused } : old,
      );
      setHealingPausedOverride(null);
      persistHealingActive(!res.healingPaused);
    },
    onError: (_err, paused, context) => {
      setHealingPausedOverride(null);
      if (context?.previous) {
        queryClient.setQueryData(["agent-status"], context.previous);
        if (context.previous.healingPaused !== undefined) {
          persistHealingActive(!context.previous.healingPaused);
        }
      } else {
        persistHealingActive(!paused);
      }
    },
  });

  const applyPaused = useCallback(
    (paused: boolean) => {
      if (!token) return;
      setHealingPausedOverride(paused);
      persistHealingActive(!paused);
      mutation.mutate(paused);
    },
    [token, mutation, setHealingPausedOverride],
  );

  const stopHealing = useCallback(() => {
    if (!effectivePaused) applyPaused(true);
  }, [effectivePaused, applyPaused]);

  const startHealing = useCallback(() => {
    if (effectivePaused) applyPaused(false);
  }, [effectivePaused, applyPaused]);

  const toggleHealing = useCallback(() => {
    applyPaused(!effectivePaused);
  }, [effectivePaused, applyPaused]);

  return {
    healingActive,
    healingPaused: effectivePaused,
    toggling: mutation.isPending,
    error: mutation.error,
    agentReachable: agentQuery.isSuccess || Boolean(token),
    stopHealing,
    startHealing,
    toggleHealing,
  };
}
