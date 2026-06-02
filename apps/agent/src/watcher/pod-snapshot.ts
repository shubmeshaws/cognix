import type { V1Pod } from "@kubernetes/client-node";

import {
  detectIssue,
  getPodRestartCount,
} from "./detectIssue.js";

export interface PodSummary {
  name: string;
  namespace: string;
  phase: string;
  restartCount: number;
  ready: boolean;
  issueType: string | null;
  hasActiveHeal: boolean;
}

function podKey(namespace: string, name: string): string {
  return `${namespace}/${name}`;
}

export function podToSummary(
  pod: V1Pod,
  activeHealKeys: Set<string>,
): PodSummary | null {
  const name = pod.metadata?.name;
  const namespace = pod.metadata?.namespace;
  if (!name || !namespace) return null;

  const issueType = detectIssue(pod);
  const statuses = pod.status?.containerStatuses ?? [];
  const ready = statuses.length > 0 && statuses.every((s) => s.ready);

  return {
    name,
    namespace,
    phase: pod.status?.phase ?? "Unknown",
    restartCount: getPodRestartCount(pod),
    ready,
    issueType,
    hasActiveHeal: activeHealKeys.has(podKey(namespace, name)),
  };
}

export class PodSnapshotStore {
  private readonly byCluster = new Map<string, Map<string, PodSummary>>();

  replace(
    clusterId: string,
    pods: V1Pod[],
    activeHealKeys: Set<string>,
  ): PodSummary[] {
    const map = new Map<string, PodSummary>();
    for (const pod of pods) {
      const summary = podToSummary(pod, activeHealKeys);
      if (!summary) continue;
      map.set(podKey(summary.namespace, summary.name), summary);
    }
    this.byCluster.set(clusterId, map);
    return [...map.values()];
  }

  upsert(
    clusterId: string,
    pod: V1Pod,
    activeHealKeys: Set<string>,
  ): PodSummary | null {
    const summary = podToSummary(pod, activeHealKeys);
    if (!summary) return null;

    let map = this.byCluster.get(clusterId);
    if (!map) {
      map = new Map();
      this.byCluster.set(clusterId, map);
    }
    map.set(podKey(summary.namespace, summary.name), summary);
    return summary;
  }

  remove(clusterId: string, namespace: string, name: string): void {
    this.byCluster.get(clusterId)?.delete(podKey(namespace, name));
  }

  list(clusterId: string): PodSummary[] | null {
    const map = this.byCluster.get(clusterId);
    if (!map) return null;
    return [...map.values()];
  }

  clear(clusterId: string): void {
    this.byCluster.delete(clusterId);
  }
}
