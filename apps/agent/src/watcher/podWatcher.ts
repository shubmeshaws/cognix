import { ADD, DELETE, UPDATE, type V1Pod } from "@kubernetes/client-node";
import { and, eq } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { healRecords } from "../db/schema.js";
import type { AgentEventBus } from "../events/bus.js";
import { healNeedsApproval } from "../healer/heal-meta.js";
import { buildOomMemorySnapshot } from "../healer/oom-snapshot.js";
import type { ClusterConnection } from "../k8s/connection.js";
import type { WorkloadRef } from "../k8s/workload.js";
import { fallbackDiagnosis } from "../llm/fallback-diagnosis.js";
import { PodReasoner } from "../llm/reasoner.js";
import type { PodDiagnosis } from "../llm/types.js";
import {
  detectIssue,
  formatEvents,
  getPodRestartCount,
  type IssueType,
} from "./detectIssue.js";
import type { PodSnapshotStore } from "./pod-snapshot.js";

const DEBOUNCE_MS = 120_000;
/** Pending heals older than this do not block new heals for the same workload. */
const PENDING_HEAL_STALE_MS = 20 * 60 * 1000;

interface WatcherLogger {
  info(obj: object, msg?: string): void;
  debug(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface PodWatcherDeps {
  db: Database;
  reasoner: PodReasoner;
  eventBus: AgentEventBus;
  log?: WatcherLogger;
  namespaceFilter?: string[];
  snapshot: PodSnapshotStore;
  /** Rule on + auto-heal not paused */
  isHealEnabled: (issue: IssueType) => boolean;
  /** Rule on only (manual heal) */
  isHealRuleEnabled: (issue: IssueType) => boolean;
  isApprovalRequired: (issue: IssueType) => boolean;
  isHealingPaused: () => boolean;
  getConcurrencyMode: () => "concurrent" | "sequential";
  refreshHealRules?: () => Promise<void>;
  maxMemoryLimit: string;
}

export class PodWatcher {
  private clusterId = "";
  private readonly deps: PodWatcherDeps;
  private readonly debounce = new Map<string, number>();
  private readonly stopFns: Array<() => void> = [];
  private connection: ClusterConnection | null = null;
  private readonly processing = new Set<string>();

  constructor(deps: PodWatcherDeps) {
    this.deps = deps;
  }

  start(connection: ClusterConnection, clusterId: string): void {
    this.connection = connection;
    this.clusterId = clusterId;
    void this.startWatchers(connection, clusterId);
  }

  /** Scan a pod snapshot for healable issues (used on connect + periodic scans). */
  async inspectPod(
    pod: V1Pod,
    opts?: { fromScan?: boolean; manual?: boolean },
  ): Promise<void> {
    if (!this.connection || !this.clusterId) return;
    try {
      await this.handlePodModified(
        pod,
        opts?.fromScan === true,
        opts?.manual === true,
      );
    } catch (err) {
      this.deps.log?.error(
        {
          err,
          clusterId: this.clusterId,
          pod: pod.metadata?.name,
          namespace: pod.metadata?.namespace,
        },
        "inspectPod failed",
      );
    }
  }

  private async startWatchers(
    connection: ClusterConnection,
    clusterId: string,
  ): Promise<void> {
    const namespaces = await connection.listNamespacesForWatch();

    for (const namespace of namespaces) {
      const stop = connection.startInformer(namespace, (type, pod) => {
        const podName = pod.metadata?.name;
        const ns = pod.metadata?.namespace;
        if (podName && ns) {
          if (type === DELETE) {
            this.deps.snapshot.remove(clusterId, ns, podName);
          } else {
            void this.refreshSnapshotPod(clusterId, pod);
          }
        }

        if (type !== ADD && type !== UPDATE) return;
        void this.handlePodModified(pod).catch((err) => {
          this.deps.log?.error(
            { err, clusterId, pod: pod.metadata?.name, namespace },
            "pod watcher handler failed",
          );
        });
      });
      this.stopFns.push(stop);
    }

    this.deps.log?.info(
      { clusterId, namespaces: namespaces.length },
      "pod watcher informers started",
    );
  }

  /** Mark old pending heals as failed so they do not block new heals. */
  async expireStalePendingHeals(): Promise<void> {
    if (!this.clusterId) return;

    const rows = await this.deps.db
      .select({ id: healRecords.id, createdAt: healRecords.createdAt })
      .from(healRecords)
      .where(
        and(
          eq(healRecords.clusterId, this.clusterId),
          eq(healRecords.status, "pending"),
        ),
      );

    const stale = rows.filter((r) => this.isStalePendingHeal(r.createdAt));
    if (!stale.length) return;

    for (const row of stale) {
      await this.deps.db
        .update(healRecords)
        .set({
          status: "failed",
          durationMs: 0,
          afterState: {
            stalePending: true,
            message: "Heal timed out while pending — unblocked for new heals",
          },
        })
        .where(eq(healRecords.id, row.id));
    }

    this.deps.log?.warn(
      { clusterId: this.clusterId, count: stale.length },
      "expired stale pending heal records",
    );
  }

  stop(): void {
    for (const stop of this.stopFns) stop();
    this.stopFns.length = 0;
    this.debounce.clear();
    this.processing.clear();
    this.connection = null;
    this.clusterId = "";
  }

  private async refreshSnapshotPod(clusterId: string, pod: V1Pod): Promise<void> {
    const keys = await this.loadActiveHealKeys(clusterId);
    this.deps.snapshot.upsert(clusterId, pod, keys);
  }

  private isStalePendingHeal(createdAt: Date): boolean {
    return Date.now() - createdAt.getTime() > PENDING_HEAL_STALE_MS;
  }

  private async loadActiveHealKeys(clusterId: string): Promise<Set<string>> {
    const rows = await this.deps.db
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
        .filter((r) => !this.isStalePendingHeal(r.createdAt))
        .filter((r) => !healNeedsApproval(r, this.deps.isApprovalRequired(r.issueType as IssueType)))
        .map((r) => `${r.namespace}/${r.podName}`),
    );
  }

  private debounceKey(podName: string, namespace: string, issue: IssueType): string {
    return `${namespace}/${podName}:${issue}`;
  }

  private isDebounced(podName: string, namespace: string, issue: IssueType): boolean {
    const key = this.debounceKey(podName, namespace, issue);
    const last = this.debounce.get(key);
    if (last && Date.now() - last < DEBOUNCE_MS) {
      return true;
    }
    this.debounce.set(key, Date.now());
    return false;
  }

  private async handlePodModified(
    pod: V1Pod,
    fromScan = false,
    manual = false,
  ): Promise<void> {
    const podName = pod.metadata?.name;
    const namespace = pod.metadata?.namespace;
    if (!podName || !namespace || !this.connection) return;

    const issueType = detectIssue(pod);
    if (!issueType) return;

    const activeKeys = await this.loadActiveHealKeys(this.clusterId);
    if (activeKeys.has(`${namespace}/${podName}`)) {
      return;
    }

    if (!manual && this.deps.isHealingPaused()) {
      this.deps.log?.debug(
        { clusterId: this.clusterId, podName, namespace, issueType },
        "heal skipped — auto-heal paused",
      );
      return;
    }

    const ruleEnabled = manual
      ? this.deps.isHealRuleEnabled(issueType)
      : this.deps.isHealEnabled(issueType);
    if (!ruleEnabled) {
      this.deps.log?.info(
        { clusterId: this.clusterId, podName, namespace, issueType, manual },
        manual
          ? "manual heal skipped — rule disabled for this issue type"
          : "heal skipped — rule disabled for this issue type",
      );
      return;
    }

    if (!fromScan && this.isDebounced(podName, namespace, issueType)) {
      this.deps.log?.debug(
        { clusterId: this.clusterId, podName, namespace, issueType },
        "issue debounced",
      );
      return;
    }

    const inflightKey = this.debounceKey(podName, namespace, issueType);
    if (this.processing.has(inflightKey)) return;

    const workload = this.connection
      ? await this.connection.resolveWorkloadForPod(podName, namespace)
      : null;
    const deploymentName =
      workload?.kind === "Deployment" ? workload.name : null;
    const deployInflightKey = workload
      ? `workload:${workload.kind}:${namespace}/${workload.name}`
      : null;
    if (deployInflightKey && this.processing.has(deployInflightKey)) return;

    this.processing.add(inflightKey);
    if (deployInflightKey) this.processing.add(deployInflightKey);

    try {
      await this.processIssue(
        pod,
        podName,
        namespace,
        issueType,
        workload,
        manual,
      );
    } finally {
      this.processing.delete(inflightKey);
      if (deployInflightKey) this.processing.delete(deployInflightKey);
    }
  }

  private async hasPendingWorkloadHeal(
    namespace: string,
    workload: { kind: string; name: string },
  ): Promise<boolean> {
    const rows = await this.deps.db
      .select({
        beforeState: healRecords.beforeState,
        createdAt: healRecords.createdAt,
      })
      .from(healRecords)
      .where(
        and(
          eq(healRecords.clusterId, this.clusterId),
          eq(healRecords.namespace, namespace),
          eq(healRecords.status, "pending"),
        ),
      );

    return rows.some((r) => {
      if (this.isStalePendingHeal(r.createdAt)) return false;
      const before = r.beforeState as {
        deploymentName?: string;
        workloadKind?: string;
        workloadName?: string;
      } | null;
      if (before?.workloadKind && before?.workloadName) {
        return (
          before.workloadKind === workload.kind &&
          before.workloadName === workload.name
        );
      }
      return (
        workload.kind === "Deployment" &&
        before?.deploymentName === workload.name
      );
    });
  }

  private async hasAnyActiveClusterHeals(): Promise<boolean> {
    const rows = await this.deps.db
      .select({
        id: healRecords.id,
        issueType: healRecords.issueType,
        beforeState: healRecords.beforeState,
        approvedBy: healRecords.approvedBy,
        createdAt: healRecords.createdAt,
      })
      .from(healRecords)
      .where(
        and(
          eq(healRecords.clusterId, this.clusterId),
          eq(healRecords.status, "pending"),
        ),
      );

    return rows.some((r) => {
      if (this.isStalePendingHeal(r.createdAt)) return false;
      const approvalRequired = this.deps.isApprovalRequired(r.issueType as IssueType);
      const needsApproval = healNeedsApproval(
        {
          id: r.id,
          beforeState: r.beforeState,
          approvedBy: r.approvedBy,
          status: "pending",
        } as any,
        approvalRequired,
      );
      return !needsApproval;
    });
  }

  clearInflight(): void {
    this.processing.clear();
  }

  private async processIssue(
    pod: V1Pod,
    podName: string,
    namespace: string,
    issueType: IssueType,
    workload: { kind: string; name: string } | null,
    manual = false,
  ): Promise<void> {
    if (!manual && this.deps.isHealingPaused()) {
      this.deps.log?.debug(
        { clusterId: this.clusterId, podName, namespace, issueType },
        "heal aborted — auto-heal paused before diagnosis",
      );
      return;
    }

    const connection = this.connection!;

    if (
      workload &&
      (await this.hasPendingWorkloadHeal(namespace, workload))
    ) {
      this.deps.log?.info(
        {
          clusterId: this.clusterId,
          podName,
          namespace,
          workloadKind: workload.kind,
          workloadName: workload.name,
          issueType,
        },
        "heal skipped — workload heal already in progress",
      );
      return;
    }

    if (this.deps.getConcurrencyMode() === "sequential" && !manual) {
      const activeHeals = await this.hasAnyActiveClusterHeals();
      if (activeHeals) {
        this.deps.log?.info(
          {
            clusterId: this.clusterId,
            podName,
            namespace,
            issueType,
          },
          "heal skipped — sequential mode: another heal is already in progress in this cluster",
        );
        return;
      }
    }

    let rawLogs = "";
    try {
      rawLogs = (await connection.getPodLogs(podName, namespace, true, 80)) ?? "";
    } catch (err) {
      this.deps.log?.warn(
        { err, podName, namespace },
        "could not fetch pod logs — continuing without logs",
      );
    }
    const logs = tailLines(rawLogs, 80);

    let k8sEvents: Awaited<ReturnType<ClusterConnection["getPodEvents"]>> = [];
    try {
      k8sEvents = (await connection.getPodEvents(podName, namespace)) ?? [];
    } catch (err) {
      this.deps.log?.warn(
        { err, podName, namespace },
        "could not fetch pod events — continuing without events",
      );
    }
    const events = formatEvents(k8sEvents);

    if (!manual && this.deps.isHealingPaused()) {
      this.deps.log?.debug(
        { clusterId: this.clusterId, podName, namespace, issueType },
        "heal aborted — auto-heal paused before LLM",
      );
      return;
    }

    let diagnosis: PodDiagnosis;
    try {
      diagnosis = await this.deps.reasoner.diagnosePod({
        podName,
        namespace,
        issueType,
        restartCount: getPodRestartCount(pod),
        logs,
        events,
      });
    } catch (err) {
      this.deps.log?.warn(
        {
          err,
          clusterId: this.clusterId,
          podName,
          namespace,
          issueType,
        },
        "llm diagnosis failed — using rule-based fallback",
      );
      diagnosis = fallbackDiagnosis(issueType);
      diagnosis = {
        ...diagnosis,
        reasoning: `${diagnosis.reasoning} (LLM unavailable: ${
          err instanceof Error ? err.message : "unknown"
        })`,
      };
    }

    if (!manual && this.deps.isHealingPaused()) {
      this.deps.log?.debug(
        { clusterId: this.clusterId, podName, namespace, issueType },
        "heal aborted — auto-heal paused before heal record",
      );
      return;
    }

    await this.deps.refreshHealRules?.();

    const approvalRequired = this.deps.isApprovalRequired(issueType);
    const diagnosisForRecord = {
      ...diagnosis,
      // Auto + approval rule: detect only, never patch until dashboard Approve.
      // Manual Heal button: operator explicitly chose this pod — may execute.
      safeToAutoHeal: manual
        ? true
        : approvalRequired
          ? false
          : diagnosis.safeToAutoHeal,
      approvalRequired: approvalRequired && !manual,
    };

    if (approvalRequired) {
      this.deps.log?.info(
        { clusterId: this.clusterId, podName, namespace, issueType },
        "heal requires approval per cluster Rules",
      );
    }

    let memoryApproval:
      | Awaited<ReturnType<typeof buildOomMemorySnapshot>>
      | undefined;
    if (issueType === "OOM" && this.connection) {
      const workloadRef: WorkloadRef | null = workload
        ? {
            kind: workload.kind as WorkloadRef["kind"],
            name: workload.name,
            namespace,
          }
        : null;
      memoryApproval =
        (await buildOomMemorySnapshot(
          pod,
          workloadRef,
          this.connection,
          this.deps.maxMemoryLimit,
        )) ?? undefined;
    }

    const healRecordId = await this.createHealRecord(
      podName,
      namespace,
      issueType,
      diagnosisForRecord,
      pod,
      workload,
      memoryApproval,
    );

    if (!manual && this.deps.isHealingPaused()) {
      this.deps.log?.debug(
        { clusterId: this.clusterId, healRecordId, podName, namespace },
        "heal aborted — auto-heal paused before pipeline",
      );
      return;
    }

    this.deps.eventBus.emitIssueDetected({
      clusterId: this.clusterId,
      healRecordId,
      podName,
      namespace,
      issueType,
      manual,
      diagnosis: diagnosisForRecord,
      pod,
      logs,
      events,
    });

    this.deps.log?.info(
      {
        clusterId: this.clusterId,
        healRecordId,
        podName,
        namespace,
        issueType,
        severity: diagnosis.severity,
        action: diagnosis.action,
      },
      "issue detected",
    );
  }

  private async createHealRecord(
    podName: string,
    namespace: string,
    issueType: IssueType,
    diagnosis: PodDiagnosis,
    pod: V1Pod,
    workload: { kind: string; name: string } | null,
    memoryApproval?: Awaited<ReturnType<typeof buildOomMemorySnapshot>>,
  ): Promise<string> {
    const [row] = await this.deps.db
      .insert(healRecords)
      .values({
        clusterId: this.clusterId,
        podName,
        namespace,
        issueType,
        severity: diagnosis.severity,
        llmReasoning: diagnosis.reasoning,
        actionTaken: diagnosis.action,
        status: "pending",
        durationMs: 0,
        beforeState: {
          phase: pod.status?.phase,
          containerStatuses: pod.status?.containerStatuses,
          conditions: pod.status?.conditions,
          labels: pod.metadata?.labels,
          safeToAutoHeal: diagnosis.safeToAutoHeal,
          approvalRequired:
            (diagnosis as PodDiagnosis & { approvalRequired?: boolean })
              .approvalRequired === true,
          patchSpec: diagnosis.patchSpec,
          deploymentName:
            workload?.kind === "Deployment" ? workload.name : undefined,
          workloadKind: workload?.kind,
          workloadName: workload?.name,
          ...(memoryApproval ? { memoryApproval } : {}),
        },
        afterState: {},
      })
      .returning({ id: healRecords.id });

    return row.id;
  }
}

function tailLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  return lines.slice(-maxLines).join("\n");
}
