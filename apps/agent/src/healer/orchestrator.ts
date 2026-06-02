import { eq } from "drizzle-orm";

import type { Env } from "../config/env.js";
import type { Database } from "../db/client.js";
import { healRecords } from "../db/schema.js";
import type { ClusterConnection } from "../k8s/connection.js";
import type { WorkloadRef } from "../k8s/workload.js";
import type { ClusterWebSocketHub } from "../ws/cluster-hub.js";
import { createPagerDutyIncident, sendSlackAlert } from "./escalation.js";
import { TerminalSession } from "./terminal.js";
import type { HealAction, HealRecord, HealStatus } from "./types.js";

interface OrchestratorLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface HealOrchestratorDeps {
  db: Database;
  env: Env;
  clusterHub: ClusterWebSocketHub;
  log?: OrchestratorLogger;
}

export interface ExecuteResult {
  healRecord: HealRecord;
  status: HealStatus;
}

export class HealOrchestrator {
  constructor(private readonly deps: HealOrchestratorDeps) {}

  async execute(
    healRecord: HealRecord,
    connection: ClusterConnection,
  ): Promise<ExecuteResult> {
    const startedAt = Date.now();
    const session = new TerminalSession(
      this.deps.db,
      healRecord.id,
      healRecord.clusterId,
      this.deps.clusterHub,
    );

    const action = normalizeAction(healRecord.actionTaken);
    const safeToAutoHeal = healRecord.beforeState?.safeToAutoHeal === true;
    const approved = Boolean(healRecord.approvedBy);
    // beforeState.approvalRequired=true means this record was created when the rule
    // was in "Approval" mode AND the pipeline routed it through the approval UI.
    // If the user has since switched the rule to "Auto", the pipeline will NOT call
    // execute() for new records — but for records already sitting in the approval
    // queue, we must still require an explicit approve click (approvedBy set).
    // AI safety check (safeToAutoHeal === false) also requires operator approval.
    const needsExplicitApproval =
      (healRecord.beforeState?.approvalRequired === true || !safeToAutoHeal) &&
      !approved;
    const mayExecute = !needsExplicitApproval;


    if (!mayExecute) {
      await session.write(
        "warn",
        "Awaiting human approval — heal action will not run automatically",
      );
      const updated = await this.finalize(healRecord, {
        status: "pending",
        durationMs: Date.now() - startedAt,
        afterState: {
          approvalRequired: true,
          action,
        },
        beforePatch: { approvalRequired: true },
      });
      return { healRecord: updated, status: "pending" };
    }

    if (action === "fix-secret") {
      return this.runEscalate(healRecord, connection, session, startedAt, {
        terminalMessage:
          "Cannot auto-fix missing secret — escalating",
        force: true,
      });
    }

    let status: HealStatus = "failed";
    let afterState: Record<string, unknown> = {};

    try {
      switch (action) {
        case "restart":
          ({ status, afterState } = await this.runRestart(
            healRecord,
            connection,
            session,
          ));
          break;
        case "patch-memory":
          ({ status, afterState } = await this.runPatchMemory(
            healRecord,
            connection,
            session,
          ));
          break;
        case "rollback":
          ({ status, afterState } = await this.runRollback(
            healRecord,
            connection,
            session,
          ));
          break;
        case "escalate":
          return this.runEscalate(healRecord, connection, session, startedAt);
        default:
          await session.write(
            "warn",
            `Unsupported action "${action}" — escalating`,
          );
          return this.runEscalate(healRecord, connection, session, startedAt);
      }

      if (status === "failed") {
        return this.runEscalate(healRecord, connection, session, startedAt, {
          terminalMessage: "Heal action failed — escalating to on-call",
          afterState,
        });
      }
    } catch (err) {
      await session.write(
        "err",
        `Heal error: ${err instanceof Error ? err.message : "unknown"}`,
      );
      return this.runEscalate(healRecord, connection, session, startedAt, {
        afterState: { error: String(err) },
      });
    }

    const updated = await this.finalize(healRecord, {
      status,
      durationMs: Date.now() - startedAt,
      afterState,
      beforePatch:
        typeof afterState.deployment === "string"
          ? { deploymentName: afterState.deployment as string }
          : undefined,
    });

    return { healRecord: updated, status };
  }

  private async runRestart(
    healRecord: HealRecord,
    connection: ClusterConnection,
    session: TerminalSession,
  ): Promise<{ status: HealStatus; afterState: Record<string, unknown> }> {
    const { podName, namespace } = healRecord;

    await session.write("cmd", "Deleting pod to trigger recreate…");
    await connection.deletePod(podName, namespace);

    await session.write("info", "Waiting for pod to become ready (60s)…");
    const ready = await connection.waitForPodReady(podName, namespace, 60_000);

    if (ready) {
      const pod = await connection.readPod(podName, namespace);
      await session.write("ok", "Pod is running and ready");
      return {
        status: "healed",
        afterState: { phase: pod?.status?.phase, ready: true },
      };
    }

    await session.write("err", "Pod did not become ready within timeout");
    return { status: "failed", afterState: { ready: false } };
  }

  private async runPatchMemory(
    healRecord: HealRecord,
    connection: ClusterConnection,
    session: TerminalSession,
  ): Promise<{ status: HealStatus; afterState: Record<string, unknown> }> {
    const workload = await this.resolveWorkload(healRecord, connection);
    if (!workload) {
      await session.write(
        "err",
        "Could not resolve workload for pod (Deployment, StatefulSet, CronJob, or KEDA ScaledJob)",
      );
      return { status: "failed", afterState: {} };
    }

    if (workload.kind === "Job") {
      await session.write(
        "warn",
        `Pod is owned by Job ${workload.name} (immutable) — cannot patch memory; restarting pod`,
      );
      return this.runRestart(healRecord, connection, session);
    }

    const display = connection.workloadDisplayName(workload);
    const bump = await connection.bumpWorkloadMemory(
      workload,
      this.deps.env.MAX_MEMORY_LIMIT,
    );

    if (!bump) {
      await session.write("err", `Could not read or patch memory on ${display}`);
      return { status: "failed", afterState: { workload: workload.name, workloadKind: workload.kind } };
    }

    const { currentLimit, newLimit, containerName } = bump;

    if (newLimit === currentLimit) {
      await session.write(
        "warn",
        `Memory limit already at ${currentLimit} (max ${this.deps.env.MAX_MEMORY_LIMIT}) — restarting pod instead`,
      );
      return this.runRestart(healRecord, connection, session);
    }

    await session.write(
      "cmd",
      `Patching ${display} memory ${currentLimit} → ${newLimit} (container ${containerName})…`,
    );

    if (workload.kind === "Deployment") {
      await connection.rolloutRestart(workload.name, healRecord.namespace);
    }

    const rolloutTimeoutMs = 120_000;
    const rolloutGraceMs = 60_000;
    const needsPodRecycle = workload.kind === "ScaledJob" || workload.kind === "CronJob";

    if (needsPodRecycle) {
      await session.write(
        "info",
        `Deleting pod to apply new ${workload.kind} template on next run…`,
      );
      await connection.deletePod(healRecord.podName, healRecord.namespace);
      await session.write(
        "ok",
        `${display} memory updated; pod deleted so the next job uses ${newLimit}`,
      );
      return {
        status: "healed",
        afterState: this.memoryAfterState(workload, currentLimit, newLimit, true),
      };
    }

    await session.write(
      "info",
      `Waiting for rollout of ${display} (${rolloutTimeoutMs / 1000}s)…`,
    );
    let rolled = await connection.waitForWorkloadRollout(
      workload,
      rolloutTimeoutMs,
    );

    if (!rolled) {
      await session.write(
        "warn",
        `Rollout still in progress — waiting ${rolloutGraceMs / 1000}s more…`,
      );
      rolled = await connection.waitForWorkloadRollout(
        workload,
        rolloutGraceMs,
      );
    }

    if (rolled) {
      await session.write("ok", `Rollout completed successfully for ${display}`);
      return {
        status: "healed",
        afterState: this.memoryAfterState(workload, currentLimit, newLimit, true),
      };
    }

    await session.write("err", "Rollout did not complete within timeout");
    return {
      status: "failed",
      afterState: this.memoryAfterState(workload, currentLimit, newLimit, false),
    };
  }

  private memoryAfterState(
    workload: WorkloadRef,
    memoryLimitBefore: string,
    memoryLimit: string,
    rolloutComplete: boolean,
  ): Record<string, unknown> {
    return {
      workload: workload.name,
      workloadKind: workload.kind,
      deployment:
        workload.kind === "Deployment" ? workload.name : undefined,
      memoryLimitBefore,
      memoryLimit,
      rolloutComplete,
    };
  }

  private async runRollback(
    healRecord: HealRecord,
    connection: ClusterConnection,
    session: TerminalSession,
  ): Promise<{ status: HealStatus; afterState: Record<string, unknown> }> {
    const workload = await this.resolveWorkload(healRecord, connection);
    if (!workload || workload.kind !== "Deployment") {
      await session.write(
        "err",
        "Rollback requires a Deployment-backed pod",
      );
      return { status: "failed", afterState: {} };
    }
    const deployName = workload.name;

    await session.write(
      "cmd",
      "Rolling back deployment to previous revision…",
    );
    await connection.rollbackDeployment(deployName, healRecord.namespace);

    await session.write("info", "Waiting for rollback rollout (90s)…");
    const rolled = await connection.waitForRollout(
      deployName,
      healRecord.namespace,
      90_000,
    );

    if (rolled) {
      await session.write("ok", "Rollback rollout completed");
      return {
        status: "healed",
        afterState: { deployment: deployName, rolledBack: true },
      };
    }

    await session.write("err", "Rollback rollout timed out");
    return {
      status: "failed",
      afterState: { deployment: deployName, rolledBack: false },
    };
  }

  private async runEscalate(
    healRecord: HealRecord,
    _connection: ClusterConnection,
    session: TerminalSession,
    startedAt: number,
    options: {
      terminalMessage?: string;
      afterState?: Record<string, unknown>;
      force?: boolean;
    } = {},
  ): Promise<ExecuteResult> {
    const message =
      options.terminalMessage ??
      "Escalated to on-call — awaiting human";

    await session.write("heal", message);

    const summary = `KubeHealer: ${healRecord.issueType} on ${healRecord.namespace}/${healRecord.podName}`;
    await sendSlackAlert(
      this.deps.env,
      healRecord,
      healRecord.llmReasoning,
      this.deps.log,
    );
    await createPagerDutyIncident(
      this.deps.env,
      healRecord,
      summary,
      this.deps.log,
    );

    await session.write("warn", "Escalated to on-call — awaiting human");

    const updated = await this.finalize(healRecord, {
      status: "escalated",
      durationMs: Date.now() - startedAt,
      afterState: {
        ...options.afterState,
        escalated: true,
        slack: Boolean(this.deps.env.SLACK_WEBHOOK_URL),
        pagerduty: Boolean(this.deps.env.PAGERDUTY_INTEGRATION_KEY),
      },
      beforePatch: options.force ? { approvalRequired: false } : undefined,
    });

    return { healRecord: updated, status: "escalated" };
  }

  private async resolveDeploymentName(
    healRecord: HealRecord,
    connection: ClusterConnection,
  ): Promise<string | null> {
    const workload = await this.resolveWorkload(healRecord, connection);
    return workload?.kind === "Deployment" ? workload.name : null;
  }

  private async resolveWorkload(
    healRecord: HealRecord,
    connection: ClusterConnection,
  ): Promise<WorkloadRef | null> {
    const before = healRecord.beforeState;
    if (before?.workloadName && before?.workloadKind) {
      return {
        kind: before.workloadKind as WorkloadRef["kind"],
        name: before.workloadName,
        namespace: healRecord.namespace,
      };
    }
    if (before?.deploymentName) {
      return {
        kind: "Deployment",
        name: before.deploymentName,
        namespace: healRecord.namespace,
      };
    }
    return connection.resolveWorkloadForPod(
      healRecord.podName,
      healRecord.namespace,
    );
  }

  private async finalize(
    healRecord: HealRecord,
    update: {
      status: HealStatus;
      durationMs: number;
      afterState: Record<string, unknown>;
      beforePatch?: Partial<HealRecord["beforeState"]>;
    },
  ): Promise<HealRecord> {
    const mergedBefore = update.beforePatch
      ? { ...healRecord.beforeState, ...update.beforePatch }
      : healRecord.beforeState;

    const [row] = await this.deps.db
      .update(healRecords)
      .set({
        status: update.status,
        durationMs: update.durationMs,
        afterState: update.afterState,
        ...(update.beforePatch
          ? { beforeState: mergedBefore as Record<string, unknown> }
          : {}),
      })
      .where(eq(healRecords.id, healRecord.id))
      .returning();

    return mapHealRecord(row);
  }
}

function normalizeAction(action: string): HealAction {
  const normalized = action.trim().toLowerCase() as HealAction;
  const allowed: HealAction[] = [
    "restart",
    "patch-memory",
    "patch-cpu",
    "rollback",
    "fix-secret",
    "scale",
    "escalate",
  ];
  return allowed.includes(normalized) ? normalized : "escalate";
}

export function mapHealRecord(row: typeof healRecords.$inferSelect): HealRecord {
  return {
    id: row.id,
    clusterId: row.clusterId,
    podName: row.podName,
    namespace: row.namespace,
    issueType: row.issueType,
    severity: row.severity,
    llmReasoning: row.llmReasoning,
    actionTaken: row.actionTaken,
    status: row.status,
    durationMs: row.durationMs,
    beforeState: (row.beforeState ?? {}) as HealRecord["beforeState"],
    afterState: (row.afterState ?? {}) as Record<string, unknown>,
    approvedBy: row.approvedBy,
    createdAt: row.createdAt,
  };
}
