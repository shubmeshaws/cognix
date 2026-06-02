import type { V1Pod } from "@kubernetes/client-node";

import type { ClusterConnection } from "../k8s/connection.js";
import type { WorkloadRef } from "../k8s/workload.js";
import { bumpMemoryLimit } from "./memory.js";
import type { HealBeforeState } from "./types.js";

export interface OomMemoryApprovalDetail {
  containerName: string;
  memoryLimit: string;
  memoryRequest?: string;
  memoryUsed?: string;
  recommendedLimit: string;
}

function oomContainerName(pod: V1Pod): string {
  const statuses = pod.status?.containerStatuses ?? [];
  const oom = statuses.find(
    (s) =>
      s.lastState?.terminated?.reason === "OOMKilled" ||
      s.state?.terminated?.reason === "OOMKilled",
  );
  return oom?.name ?? statuses[0]?.name ?? pod.spec?.containers?.[0]?.name ?? "app";
}

export function memoryApprovalFromBeforeState(
  beforeState: unknown,
): OomMemoryApprovalDetail | undefined {
  const raw = (beforeState as HealBeforeState | null)?.memoryApproval;
  if (!raw || typeof raw !== "object") return undefined;
  const m = raw as OomMemoryApprovalDetail;
  if (typeof m.memoryLimit !== "string" || typeof m.recommendedLimit !== "string") {
    return undefined;
  }
  return m;
}

/** Capture limit, request, usage, and recommended bump for OOM approval UI. */
export async function buildOomMemorySnapshot(
  pod: V1Pod,
  workload: WorkloadRef | null,
  connection: ClusterConnection,
  maxMemoryLimit: string,
): Promise<OomMemoryApprovalDetail | null> {
  const podName = pod.metadata?.name;
  const namespace = pod.metadata?.namespace;
  if (!podName || !namespace) return null;

  let containerName = oomContainerName(pod);
  let memoryLimit: string | undefined;
  let memoryRequest: string | undefined;

  if (workload) {
    const mem = await connection.readWorkloadMemory(workload);
    if (mem) {
      containerName = mem.containerName;
      memoryLimit = mem.currentLimit;
      memoryRequest = mem.requestMemory;
    }
  }

  if (!memoryLimit) {
    const spec =
      pod.spec?.containers?.find((c) => c.name === containerName) ??
      pod.spec?.containers?.[0];
    memoryLimit = spec?.resources?.limits?.memory ?? "256Mi";
    memoryRequest = spec?.resources?.requests?.memory;
  }

  const recommendedLimit = bumpMemoryLimit(memoryLimit, maxMemoryLimit);

  let memoryUsed = await connection.getPodContainerMemoryUsage(
    podName,
    namespace,
    containerName,
  );

  if (!memoryUsed) {
    const wasOom = (pod.status?.containerStatuses ?? []).some(
      (s) =>
        s.name === containerName &&
        (s.lastState?.terminated?.reason === "OOMKilled" ||
          s.state?.terminated?.reason === "OOMKilled"),
    );
    memoryUsed = wasOom ? `≥ ${memoryLimit} (OOM at limit)` : "unavailable";
  }

  return {
    containerName,
    memoryLimit,
    memoryRequest,
    memoryUsed,
    recommendedLimit,
  };
}
