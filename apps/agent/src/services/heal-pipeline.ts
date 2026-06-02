import { eq } from "drizzle-orm";

import type { ServerDeps } from "../context/deps.js";
import { healRecords } from "../db/schema.js";
import type { IssueDetectedPayload } from "../events/bus.js";
import { healNeedsApproval } from "../healer/heal-meta.js";
import { memoryApprovalFromBeforeState } from "../healer/oom-snapshot.js";
import { mapHealRecord } from "../healer/orchestrator.js";
import { TerminalSession } from "../healer/terminal.js";
import type { IssueType } from "../watcher/detectIssue.js";
import { notifyHealCompleted } from "./heal-notifications.js";

interface PipelineLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

const HEAL_PIPELINE_TIMEOUT_MS = 12 * 60 * 1000;

function pipelineTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error(`Heal pipeline timed out after ${ms / 1000}s`)),
      ms,
    );
  });
}

/** Runs terminal output + heal orchestration after the watcher detects an issue. */
export async function runHealPipeline(
  deps: ServerDeps,
  payload: IssueDetectedPayload,
  log?: PipelineLogger,
): Promise<void> {
  const { clusterId, healRecordId, podName, namespace, issueType, diagnosis } =
    payload;

  if (deps.watcher.isHealingPaused() && !payload.manual) {
    log?.info(
      { clusterId, healRecordId, podName, namespace },
      "heal pipeline skipped — auto-heal paused",
    );
    await deps.db
      .update(healRecords)
      .set({
        status: "skipped",
        durationMs: 0,
        afterState: { reason: "auto-heal paused" },
      })
      .where(eq(healRecords.id, healRecordId));

    deps.clusterHub.broadcastToCluster(clusterId, {
      type: "heal:complete",
      healId: healRecordId,
      status: "skipped",
      durationMs: 0,
      podName,
      namespace,
      issue: issueType,
      action: diagnosis.action,
      severity: diagnosis.severity,
    });
    return;
  }

  const connection = deps.watcher.getConnection(clusterId);
  if (!connection) {
    log?.warn({ clusterId, healRecordId }, "no cluster connection for heal pipeline");
    return;
  }

  const [row] = await deps.db
    .select()
    .from(healRecords)
    .where(eq(healRecords.id, healRecordId))
    .limit(1);

  if (!row) {
    log?.warn({ healRecordId }, "heal record missing for pipeline");
    return;
  }

  const record = mapHealRecord(row);
  const ruleRequiresApproval = deps.watcher.isApprovalRequiredForCluster(
    clusterId,
    issueType as IssueType,
  );
  // Use the LIVE rule setting as the sole source of truth.
  // healNeedsApproval(row) and beforeState.safeToAutoHeal are baked-in snapshots
  // from detection time — if the user switches a rule from "Approval" → "Auto",
  // those old fields would still block the heal. The current rule always wins.
  const mustWaitForApproval = ruleRequiresApproval;
  const safeToAutoHeal = !mustWaitForApproval;


  deps.clusterHub.broadcastToCluster(clusterId, {
    type: "heal:start",
    healId: healRecordId,
    podName,
    namespace,
    issue: issueType,
    action: diagnosis.action,
    severity: diagnosis.severity,
  });

  const session = new TerminalSession(
    deps.db,
    healRecordId,
    clusterId,
    deps.clusterHub,
  );

  await session.write(
    "heal",
    `▶ Heal started — ${issueType} on ${namespace}/${podName}`,
  );
  await session.write(
    "info",
    `Issue detected: ${issueType} on ${namespace}/${podName}`,
  );
  await session.write(
    "heal",
    `Root cause: ${diagnosis.rootCause}`,
  );
  await session.write(
    "info",
    `Planned action: ${diagnosis.action} (severity: ${diagnosis.severity})`,
  );
  await session.write("info", diagnosis.reasoning);

  if (!safeToAutoHeal) {
    await deps.db
      .update(healRecords)
      .set({
        afterState: {
          ...((row.afterState as Record<string, unknown>) ?? {}),
          approvalRequired: true,
          awaitingApproval: true,
        },
      })
      .where(eq(healRecords.id, healRecordId));

    const memory = memoryApprovalFromBeforeState(record.beforeState);
    deps.clusterHub.broadcastToCluster(clusterId, {
      type: "approval:required",
      healId: healRecordId,
      podName,
      namespace,
      issue: issueType,
      action: diagnosis.action,
      reasoning: diagnosis.reasoning,
      severity: diagnosis.severity,
      memory,
    });

    let reason = "Cluster Rules require approval for this issue type";
    if (!ruleRequiresApproval) {
      if (record.beforeState?.safeToAutoHeal === false) {
        reason = "AI safety check determined this workload is risky to auto-heal";
      } else {
        reason = "Approval required by system policy";
      }
    }

    await session.write(
      "warn",
      `Awaiting human approval — fix will not run until approved in the dashboard. (${reason})`,
    );

    log?.info(
      { clusterId, healRecordId, podName, namespace, issueType, reason },
      "heal pipeline paused for approval",
    );
    return;
  }

  try {
    const result = await Promise.race([
      deps.orchestrator.execute(record, connection),
      pipelineTimeout(HEAL_PIPELINE_TIMEOUT_MS),
    ]);

    const after = result.healRecord.afterState;
    const before = result.healRecord.beforeState;

    deps.clusterHub.broadcastToCluster(clusterId, {
      type: "heal:complete",
      healId: result.healRecord.id,
      status: result.status,
      durationMs: result.healRecord.durationMs,
      podName: result.healRecord.podName,
      namespace: result.healRecord.namespace,
      issue: result.healRecord.issueType,
      action: result.healRecord.actionTaken,
      severity: result.healRecord.severity,
      deploymentName:
        before.deploymentName ??
        (typeof after.deployment === "string"
          ? after.deployment
          : after.workloadKind === "Deployment" &&
              typeof after.workload === "string"
            ? after.workload
            : undefined),
      rolloutComplete: after.rolloutComplete === true,
    });

    log?.info(
      {
        clusterId,
        healRecordId,
        status: result.status,
        pod: `${namespace}/${podName}`,
      },
      "heal pipeline finished",
    );

    await notifyHealCompleted(deps, result.healRecord, log);
  } catch (err) {
    log?.error({ err, clusterId, healRecordId }, "heal pipeline failed");

    await session.write(
      "err",
      `Pipeline error: ${err instanceof Error ? err.message : "unknown"}`,
    );

    const [failed] = await deps.db
      .update(healRecords)
      .set({
        status: "failed",
        durationMs: 0,
        afterState: { pipelineError: String(err) },
      })
      .where(eq(healRecords.id, healRecordId))
      .returning();

    if (failed) {
      deps.clusterHub.broadcastToCluster(clusterId, {
        type: "heal:complete",
        healId: failed.id,
        status: "failed",
        durationMs: failed.durationMs,
        podName: failed.podName,
        namespace: failed.namespace,
        issue: failed.issueType,
        action: failed.actionTaken,
        severity: failed.severity,
      });
    }
  }
}
