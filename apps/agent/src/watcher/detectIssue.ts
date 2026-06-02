import type { V1ContainerStatus, V1Pod } from "@kubernetes/client-node";

export type IssueType =
  | "CrashLoop"
  | "OOM"
  | "Pending"
  | "ImagePull"
  | "NodePressure"
  | "MultiVolumeAttachment";

const PENDING_THRESHOLD_SEC = 300;
const IMAGE_PULL_MARKERS = ["ImagePull", "ErrImagePull"];
const VOLUME_MOUNT_MARKERS = [
  "FailedMount",
  "VolumeAttachment",
  "FailedAttachVolume",
];

function isOomContainer(status: V1ContainerStatus): boolean {
  const last = status.lastState?.terminated;
  const current = status.state?.terminated;
  const waitingReason = status.state?.waiting?.reason ?? "";

  if (last?.exitCode === 137 || current?.exitCode === 137) return true;
  if (last?.reason === "OOMKilled" || current?.reason === "OOMKilled") {
    return true;
  }
  if (waitingReason.includes("OOMKilled")) return true;
  return false;
}

export function detectIssue(pod: V1Pod): IssueType | null {
  const containerStatuses = pod.status?.containerStatuses ?? [];

  // OOM first — pods often show CrashLoopBackOff after OOMKilled.
  for (const status of containerStatuses) {
    if (isOomContainer(status)) {
      return "OOM";
    }
  }

  for (const status of containerStatuses) {
    if (status.state?.waiting?.reason === "CrashLoopBackOff") {
      return "CrashLoop";
    }

    const waitingReason = status.state?.waiting?.reason ?? "";
    if (IMAGE_PULL_MARKERS.some((m) => waitingReason.includes(m))) {
      return "ImagePull";
    }
    if (
      VOLUME_MOUNT_MARKERS.some(
        (m) => waitingReason === m || waitingReason.includes("Attach"),
      )
    ) {
      return "MultiVolumeAttachment";
    }
  }

  for (const cond of pod.status?.conditions ?? []) {
    const text = `${cond.reason ?? ""} ${cond.message ?? ""}`;
    if (
      /multi-attach|already mounted|volumeattachment/i.test(text) ||
      /failedmount/i.test(cond.reason ?? "")
    ) {
      return "MultiVolumeAttachment";
    }
    if (
      cond.type === "PodScheduled" &&
      cond.status === "False" &&
      /node.*pressure|diskpressure|memorypressure|pidpressure/i.test(text)
    ) {
      return "NodePressure";
    }
  }

  if (pod.status?.phase === "Pending") {
    const createdAt = pod.metadata?.creationTimestamp;
    if (createdAt) {
      const ageSec = (Date.now() - new Date(createdAt).getTime()) / 1000;
      if (ageSec > PENDING_THRESHOLD_SEC) {
        return "Pending";
      }
    }
  }

  return null;
}

export function getPodRestartCount(pod: V1Pod): number {
  const statuses = pod.status?.containerStatuses ?? [];
  return statuses.reduce((max, s) => Math.max(max, s.restartCount ?? 0), 0);
}

export function formatEvents(events: Array<{ message?: string; reason?: string; type?: string }>): string[] {
  return events
    .slice(-20)
    .map((e) => `[${e.type ?? "Event"}] ${e.reason ?? "unknown"}: ${e.message ?? ""}`)
    .filter((line) => line.trim().length > 0);
}
