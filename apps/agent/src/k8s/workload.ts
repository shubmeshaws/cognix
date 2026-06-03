import type { V1Pod } from "@kubernetes/client-node";

export type WorkloadKind =
  | "Deployment"
  | "StatefulSet"
  | "CronJob"
  | "ScaledJob"
  | "Job";

export interface WorkloadRef {
  kind: WorkloadKind;
  name: string;
  namespace: string;
}

export function workloadInflightKey(ref: WorkloadRef): string {
  return `${ref.kind}:${ref.namespace}/${ref.name}`;
}

/** Pick the longest ScaledJob name that matches a Job name prefix. */
export function matchScaledJobName(
  jobName: string,
  scaledJobNames: string[],
): string | null {
  let best: string | null = null;
  for (const sj of scaledJobNames) {
    if (jobName === sj || jobName.startsWith(`${sj}-`)) {
      if (!best || sj.length > best.length) best = sj;
    }
  }
  return best;
}

export const KEDA_SCALEDJOB_LABEL = "scaledjob.keda.sh/name";

const JOB_OWNED_KINDS = new Set<WorkloadKind>(["Job", "CronJob", "ScaledJob"]);

/** True when the pod belongs to a batch-style workload (Job, CronJob, or ScaledJob). */
export function isJobOwnedWorkload(
  workload: { kind: string } | null | undefined,
): boolean {
  return Boolean(workload && JOB_OWNED_KINDS.has(workload.kind as WorkloadKind));
}

/** Detect batch pods from owner refs, standard job labels, or KEDA ScaledJob pod names. */
export function isJobOwnedPod(pod: V1Pod): boolean {
  const owners = pod.metadata?.ownerReferences ?? [];
  if (owners.some((owner) => owner.kind === "Job")) {
    return true;
  }

  const labels = pod.metadata?.labels ?? {};
  if (labels["batch.kubernetes.io/job-name"] || labels["job-name"]) {
    return true;
  }

  const name = pod.metadata?.name ?? "";
  if (name.includes("-scaledjob-")) {
    return true;
  }

  return false;
}

/** Skip healing when job pods are disabled and the pod is batch-owned. */
export function shouldSkipJobPodHeal(
  pod: V1Pod,
  workload: { kind: string } | null | undefined,
  healJobPodsEnabled: boolean,
): boolean {
  if (healJobPodsEnabled) return false;
  return isJobOwnedPod(pod) || isJobOwnedWorkload(workload);
}

function nameLooksLikeWorker(name: string): boolean {
  return name.toLowerCase().includes("worker");
}

/** True when the pod belongs to a Deployment whose name identifies it as a worker. */
export function isWorkerOwnedWorkload(
  workload: { kind: string; name?: string } | null | undefined,
): boolean {
  if (!workload || workload.kind !== "Deployment" || !workload.name) return false;
  return nameLooksLikeWorker(workload.name);
}

/** Detect worker Deployment pods from pod name patterns and common app labels. */
export function isWorkerOwnedPod(pod: V1Pod): boolean {
  if (isJobOwnedPod(pod)) return false;

  const name = pod.metadata?.name ?? "";
  if (/-worker-[a-z0-9]+-/i.test(name)) {
    return true;
  }

  const labels = pod.metadata?.labels ?? {};
  for (const key of [
    "app",
    "app.kubernetes.io/name",
    "app.kubernetes.io/component",
  ]) {
    const value = labels[key];
    if (typeof value === "string" && nameLooksLikeWorker(value)) {
      return true;
    }
  }

  return false;
}

/** Skip healing when worker deployments are disabled and the pod is worker-owned. */
export function shouldSkipWorkerPodHeal(
  pod: V1Pod,
  workload: { kind: string } | null | undefined,
  healWorkerPodsEnabled: boolean,
): boolean {
  if (healWorkerPodsEnabled) return false;
  return isWorkerOwnedPod(pod) || isWorkerOwnedWorkload(workload);
}

export function shouldSkipScopedPodHeal(
  pod: V1Pod,
  workload: { kind: string; name: string } | null | undefined,
  scope: { healJobPods: boolean; healWorkerPods: boolean },
): boolean {
  return (
    shouldSkipJobPodHeal(pod, workload, scope.healJobPods) ||
    shouldSkipWorkerPodHeal(pod, workload, scope.healWorkerPods)
  );
}

export function scopedPodHealSkipReason(
  pod: V1Pod,
  workload: { kind: string; name: string } | null | undefined,
  scope: { healJobPods: boolean; healWorkerPods: boolean },
): "job" | "worker" | null {
  if (shouldSkipJobPodHeal(pod, workload, scope.healJobPods)) return "job";
  if (shouldSkipWorkerPodHeal(pod, workload, scope.healWorkerPods)) return "worker";
  return null;
}
