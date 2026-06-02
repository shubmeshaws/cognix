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
