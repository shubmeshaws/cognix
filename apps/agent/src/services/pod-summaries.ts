import { and, eq } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { healRecords } from "../db/schema.js";
import { healNeedsApproval } from "../healer/heal-meta.js";
import type { PodSummary } from "../watcher/pod-snapshot.js";
import { podToSummary } from "../watcher/pod-snapshot.js";
import type { ClusterConnection } from "../k8s/connection.js";
import type { WatcherService } from "./watcher.js";

export async function loadActiveHealKeys(
  db: Database,
  clusterId: string,
  watcher: WatcherService,
): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(healRecords)
    .where(
      and(
        eq(healRecords.clusterId, clusterId),
        eq(healRecords.status, "pending"),
      ),
    );
  return new Set(
    rows
      .filter((row) => !healNeedsApproval(row, watcher.isApprovalRequiredForCluster(clusterId, row.issueType as any)))
      .map((h) => `${h.namespace}/${h.podName}`),
  );
}

export function mergeHealFlags(
  pods: PodSummary[],
  activeHealKeys: Set<string>,
): PodSummary[] {
  return pods.map((p) => ({
    ...p,
    hasActiveHeal: activeHealKeys.has(`${p.namespace}/${p.name}`),
  }));
}

function summariesFromPods(
  pods: import("@kubernetes/client-node").V1Pod[],
  activeHealKeys: Set<string>,
): PodSummary[] {
  return pods
    .map((pod) => podToSummary(pod, activeHealKeys))
    .filter((p): p is PodSummary => p !== null);
}

export async function listPodSummaries(
  db: Database,
  watcher: WatcherService,
  clusterId: string,
  connection: ClusterConnection,
): Promise<PodSummary[]> {
  const activeHealKeys = await loadActiveHealKeys(db, clusterId, watcher);

  if (watcher.isRunning(clusterId) && !watcher.isSnapshotReady(clusterId)) {
    await watcher.waitForPodSnapshot(clusterId, 10_000);
  }

  // Always list from the API so the dashboard gets the full cluster, not a
  // partial informer cache (which can return only the first few pods).
  const pods = await connection.listPodsWithTimeout(15_000);
  if (pods !== null) {
    const summaries = summariesFromPods(pods, activeHealKeys);
    if (watcher.isRunning(clusterId)) {
      watcher.syncPodSnapshot(clusterId, pods, activeHealKeys);
    }
    return summaries;
  }

  const cached = watcher.getPodSummaries(clusterId);
  if (cached?.length) {
    return mergeHealFlags(cached, activeHealKeys);
  }

  if (!watcher.isRunning(clusterId)) {
    return [];
  }

  return [];
}
