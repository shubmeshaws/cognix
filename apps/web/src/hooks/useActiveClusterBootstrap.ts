"use client";

import { useEffect } from "react";

import { useClusters } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";

const STORAGE_KEY = "kubehealer-active-cluster";

export function useActiveClusterBootstrap(): void {
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const setCluster = useClusterStore((s) => s.setCluster);
  const clustersQuery = useClusters();

  useEffect(() => {
    const clusters = clustersQuery.data;
    if (!clusters?.length) return;

    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null;

    const storedValid = Boolean(stored && clusters.some((c) => c.id === stored));

    if (activeClusterId && !clusters.some((c) => c.id === activeClusterId)) {
      setCluster(storedValid ? stored! : clusters[0]!.id);
      return;
    }

    if (!activeClusterId) {
      setCluster(storedValid ? stored! : clusters[0]!.id);
    }
  }, [activeClusterId, clustersQuery.data, setCluster]);
}

export function persistActiveClusterId(clusterId: string | null): void {
  if (typeof window === "undefined") return;
  if (clusterId) {
    localStorage.setItem(STORAGE_KEY, clusterId);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}
