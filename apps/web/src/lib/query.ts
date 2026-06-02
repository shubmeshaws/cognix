"use client";

import {
  keepPreviousData,
  useQuery,
  type Query,
} from "@tanstack/react-query";
import { useEffect } from "react";

import { useAgentToken } from "@/hooks/useAgentToken";

import {
  ApiError,
  fetchAgentStatus,
  fetchAlerts,
  fetchClusters,
  fetchHealRules,
  fetchHealTerminal,
  fetchLiveTerminal,
  fetchHeals,
  fetchPendingApprovals,
  fetchPods,
  fetchNodes,
  fetchPodLogs,
} from "@/lib/api";
import { derivePendingApprovals } from "@/lib/pending-approvals";
import { useClusterStore } from "@/stores/cluster";
import type { PodSummary, NodeSummary } from "@/types/api";

/** Background refresh interval for all dashboard data queries. */
export const REFETCH_INTERVAL_MS = 10_000;

export const queryClientDefaults = {
  queries: {
    staleTime: REFETCH_INTERVAL_MS,
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  },
};

function useActiveClusterId(): string | null {
  return useClusterStore((s) => s.activeClusterId);
}

/** Only reuse cached rows when refetching the same cluster — never another cluster's pods. */
function keepPreviousDataForSameCluster<T>(clusterId: string | null) {
  return (
    previousData: T | undefined,
    previousQuery: Query<T, Error> | undefined,
  ) => {
    if (!clusterId || previousQuery?.queryKey[1] !== clusterId) {
      return undefined;
    }
    return keepPreviousData(previousData);
  };
}

export function usePods() {
  const clusterId = useActiveClusterId();
  const token = useAgentToken();
  const setPods = useClusterStore((s) => s.setPods);

  const query = useQuery({
    queryKey: ["pods", clusterId],
    queryFn: () => fetchPods(clusterId!, token!),
    enabled: Boolean(clusterId && token),
    placeholderData: keepPreviousDataForSameCluster<PodSummary[]>(clusterId),
  });

  useEffect(() => {
    if (!clusterId || query.isPlaceholderData || !query.data) return;
    setPods(query.data);
  }, [clusterId, query.data, query.isPlaceholderData, setPods]);

  return query;
}

export function useNodes() {
  const clusterId = useActiveClusterId();
  const token = useAgentToken();

  return useQuery({
    queryKey: ["nodes", clusterId],
    queryFn: () => fetchNodes(clusterId!, token!),
    enabled: Boolean(clusterId && token),
    placeholderData: keepPreviousDataForSameCluster<NodeSummary[]>(clusterId),
  });
}

export function usePodLogs(namespace: string | undefined, podName: string | undefined) {
  const clusterId = useActiveClusterId();
  const token = useAgentToken();

  return useQuery({
    queryKey: ["pod-logs", clusterId, namespace, podName],
    queryFn: () => fetchPodLogs(clusterId!, namespace!, podName!, token!),
    enabled: Boolean(clusterId && token && namespace && podName),
    refetchInterval: false,
  });
}

export function useHeals(page = 1, pageSize = 20) {
  const clusterId = useActiveClusterId();
  const token = useAgentToken();
  const setHeals = useClusterStore((s) => s.setHeals);

  const query = useQuery({
    queryKey: ["heals", clusterId, page, pageSize],
    queryFn: () => fetchHeals(clusterId!, token!, page, pageSize),
    enabled: Boolean(clusterId && token),
  });

  useEffect(() => {
    if (!clusterId || query.isPlaceholderData || !query.data?.items) return;
    setHeals(query.data.items);
  }, [clusterId, query.data, query.isPlaceholderData, setHeals]);

  return query;
}

export function useAlerts() {
  const clusterId = useActiveClusterId();
  const token = useAgentToken();
  const setAlerts = useClusterStore((s) => s.setAlerts);

  const query = useQuery({
    queryKey: ["alerts", clusterId],
    queryFn: () => fetchAlerts(clusterId!, token!),
    enabled: Boolean(clusterId && token),
  });

  useEffect(() => {
    if (!clusterId || query.isPlaceholderData || !query.data) return;
    setAlerts(query.data);
  }, [clusterId, query.data, query.isPlaceholderData, setAlerts]);

  return query;
}

export function useAgentStatus() {
  const token = useAgentToken();

  return useQuery({
    queryKey: ["agent-status"],
    queryFn: () => fetchAgentStatus(token!),
    enabled: Boolean(token),
  });
}

export function useClusters() {
  const token = useAgentToken();

  return useQuery({
    queryKey: ["clusters"],
    queryFn: () => fetchClusters(token!),
    enabled: Boolean(token),
  });
}

/** Keeps approval cards in sync when WebSocket events were missed. */
export function usePendingApprovals() {
  const clusterId = useActiveClusterId();
  const token = useAgentToken();
  const heals = useClusterStore((s) => s.heals);
  const terminalLines = useClusterStore((s) => s.terminalLines);
  const syncPendingApprovals = useClusterStore((s) => s.syncPendingApprovals);

  const query = useQuery({
    queryKey: ["pending-approvals", clusterId],
    queryFn: () => fetchPendingApprovals(clusterId!, token!),
    enabled: Boolean(clusterId && token),
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 2;
    },
  });

  useEffect(() => {
    if (!clusterId) return;

    const apiItems = query.data?.items ?? [];

    if (query.isFetched && !query.isError) {
      syncPendingApprovals(apiItems);
      return;
    }

    if (query.isError) {
      const derived = derivePendingApprovals(heals, terminalLines);
      syncPendingApprovals(derived);
    }
  }, [
    clusterId,
    query.data,
    query.isFetched,
    heals,
    terminalLines,
    syncPendingApprovals,
  ]);

  return query;
}

export function useHealRules() {
  const clusterId = useActiveClusterId();
  const token = useAgentToken();

  return useQuery({
    queryKey: ["heal-rules", clusterId],
    queryFn: () => fetchHealRules(token!, clusterId!),
    enabled: Boolean(clusterId && token),
  });
}

export function useHealTerminal(healId: string | undefined) {
  const token = useAgentToken();

  return useQuery({
    queryKey: ["heal-terminal", healId],
    queryFn: () => fetchHealTerminal(healId!, token!),
    enabled: Boolean(healId && token),
  });
}

/** Hydrates live dashboard terminal from persisted agent output. */
export function useLiveTerminal() {
  const clusterId = useActiveClusterId();
  const token = useAgentToken();
  const setTerminalLines = useClusterStore((s) => s.setTerminalLines);

  const query = useQuery({
    queryKey: ["live-terminal", clusterId],
    queryFn: () => fetchLiveTerminal(clusterId!, token!),
    enabled: Boolean(clusterId && token),
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!clusterId || !query.data?.lines) return;
    setTerminalLines(
      query.data.lines.map((line) => ({
        id: line.id,
        healId: line.healId,
        clusterId: line.clusterId,
        sequence: line.sequence,
        level: line.level,
        text: line.text,
        timestamp: line.ts,
      })),
    );
  }, [clusterId, query.data, setTerminalLines]);

  return query;
}
