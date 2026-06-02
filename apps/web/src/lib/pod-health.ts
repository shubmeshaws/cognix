import type { HealRecord, PodSummary } from "@/types/api";

export const RECENTLY_HEALED_MS = 10 * 60 * 1000;

export function healDeploymentName(heal: HealRecord): string | null {
  return heal.deploymentName ?? null;
}

export function podMatchesHeal(pod: PodSummary, heal: HealRecord): boolean {
  if (pod.namespace !== heal.namespace) return false;
  if (pod.name === heal.podName) return true;

  const deployment = healDeploymentName(heal);
  if (!deployment) return false;
  return pod.name === deployment || pod.name.startsWith(`${deployment}-`);
}

export function isRecentlyHealed(heal: HealRecord): boolean {
  const age = Date.now() - new Date(heal.createdAt).getTime();
  if (age >= RECENTLY_HEALED_MS) return false;
  if (heal.status === "healed") return true;
  if (heal.rolloutComplete) return true;
  return false;
}

export function findHealForPod(
  pod: PodSummary,
  heals: HealRecord[],
): HealRecord | undefined {
  return heals
    .filter((h) => podMatchesHeal(pod, h))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
}
