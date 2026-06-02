import type { healRecords } from "../db/schema.js";
import type { HealBeforeState, HealStatus } from "./types.js";

export interface HealListMeta {
  deploymentName: string | null;
  rolloutComplete: boolean;
  memoryPatched: boolean;
}

/** Pending heal that must be approved in the dashboard before the agent patches. */
export function healNeedsApproval(
  row: typeof healRecords.$inferSelect,
  ruleRequiresApproval?: boolean,
): boolean {
  if ((row.status as HealStatus) !== "pending") return false;
  if (row.approvedBy) return false;

  // If we know the live rule setting, use it as the source of truth
  if (ruleRequiresApproval !== undefined) {
    return ruleRequiresApproval;
  }

  // Fallback to stale DB state if live rule isn't provided
  const before = (row.beforeState ?? {}) as HealBeforeState;
  const after = (row.afterState ?? {}) as Record<string, unknown>;
  if (before.approvalRequired === true) return true;
  if (before.safeToAutoHeal === true) return false;
  if (before.safeToAutoHeal === false) return true;
  return after.approvalRequired === true;
}

export function healListMeta(
  row: typeof healRecords.$inferSelect,
): HealListMeta {
  const before = (row.beforeState ?? {}) as HealBeforeState;
  const after = (row.afterState ?? {}) as Record<string, unknown>;
  const deployment =
    typeof before.deploymentName === "string"
      ? before.deploymentName
      : typeof before.workloadName === "string" &&
          before.workloadKind === "Deployment"
        ? before.workloadName
        : typeof after.deployment === "string"
          ? after.deployment
          : typeof after.workload === "string" &&
              after.workloadKind === "Deployment"
            ? after.workload
            : null;

  return {
    deploymentName: deployment,
    rolloutComplete: after.rolloutComplete === true,
    memoryPatched: typeof after.memoryLimit === "string",
  };
}
