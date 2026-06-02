import type { HealRecord } from "@/types/api";

/** Internal heal action ids → short operator-facing labels. */
export const HEAL_ACTION_LABELS: Record<string, string> = {
  rollback: "rollback",
  restart: "restart",
  "patch-memory": "increase memory",
  escalate: "escalate",
  "fix-secret": "fix secret",
  "patch-cpu": "patch CPU",
  scale: "scale",
};

export function formatHealActionLabel(action: string): string {
  const key = action.trim().toLowerCase();
  return HEAL_ACTION_LABELS[key] ?? action;
}

export function healAwaitingApproval(
  heal: HealRecord,
  pendingHealIds?: ReadonlySet<string>,
): boolean {
  if (heal.status !== "pending") return false;
  if (heal.needsApproval === true) return true;
  if (pendingHealIds?.has(heal.id)) return true;
  return false;
}
