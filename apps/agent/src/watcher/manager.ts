import type { ClusterConfig } from "@kubehealer/shared";
import { and, eq } from "drizzle-orm";

import type { Env } from "../config/env.js";
import type { Database } from "../db/client.js";
import { clusters, healRecords } from "../db/schema.js";
import type { AgentEventBus } from "../events/bus.js";
import { decryptSecret } from "../lib/crypto.js";
import { kubeconfigToBase64 } from "../lib/kubeconfig.js";
import { ClusterConnection } from "../k8s/connection.js";
import { PodReasoner } from "../llm/reasoner.js";
import {
  defaultEnabledHealRules,
  normalizeStoredHealRules,
  toEnabledSet,
  validateHealRuleModes,
} from "../services/heal-rules.js";
import {
  healRuleRequiresApproval,
  type HealRuleId,
  type HealRuleMode,
} from "@kubehealer/shared";
import { healNeedsApproval } from "../healer/heal-meta.js";
import { PodSnapshotStore } from "./pod-snapshot.js";
import { PodWatcher, type PodWatcherDeps } from "./podWatcher.js";
import { detectIssue, type IssueType } from "./detectIssue.js";

export interface ClusterHealth {
  ok: boolean;
  version: string;
  checkedAt: string;
}

interface ManagerLogger {
  info(obj: object, msg?: string): void;
  debug(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

interface ActiveCluster {
  watcher: PodWatcher;
  connection: ClusterConnection;
  health: ClusterHealth;
}

export interface WatcherManagerDeps {
  db: Database;
  env: Env;
  eventBus: AgentEventBus;
  log?: ManagerLogger;
}

export class WatcherManager {
  private readonly active = new Map<string, ActiveCluster>();
  private readonly podSnapshots = new PodSnapshotStore();
  private readonly snapshotSeeded = new Set<string>();
  private readonly enabledHealRules = new Map<string, Set<HealRuleId>>();
  private readonly healRuleModes = new Map<
    string,
    Record<HealRuleId, HealRuleMode>
  >();
  private readonly concurrencyModes = new Map<string, "concurrent" | "sequential">();
  private readonly reasoner: PodReasoner;

  constructor(private readonly deps: WatcherManagerDeps) {
    this.reasoner = new PodReasoner({ env: deps.env, log: deps.log });
  }

  getHealth(clusterId: string): ClusterHealth | null {
    return this.active.get(clusterId)?.health ?? null;
  }

  isRunning(clusterId: string): boolean {
    return this.active.has(clusterId);
  }

  getConnection(clusterId: string): ClusterConnection | null {
    return this.active.get(clusterId)?.connection ?? null;
  }

  getPodSummaries(clusterId: string): import("./pod-snapshot.js").PodSummary[] | null {
    return this.podSnapshots.list(clusterId);
  }

  isSnapshotReady(clusterId: string): boolean {
    return this.snapshotSeeded.has(clusterId);
  }

  syncPodSnapshot(
    clusterId: string,
    pods: import("@kubernetes/client-node").V1Pod[],
    activeHealKeys: Set<string>,
  ): import("./pod-snapshot.js").PodSummary[] {
    return this.podSnapshots.replace(clusterId, pods, activeHealKeys);
  }

  async waitForPodSnapshot(
    clusterId: string,
    maxWaitMs = 8_000,
  ): Promise<import("./pod-snapshot.js").PodSummary[] | null> {
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      if (this.snapshotSeeded.has(clusterId)) {
        return this.podSnapshots.list(clusterId);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return this.podSnapshots.list(clusterId);
  }

  get podSnapshotStore(): PodSnapshotStore {
    return this.podSnapshots;
  }

  setEnabledHealRules(clusterId: string, rules: HealRuleId[]): void {
    this.enabledHealRules.set(clusterId, toEnabledSet(rules));
  }

  setHealRuleModes(
    clusterId: string,
    modes: Record<HealRuleId, HealRuleMode>,
  ): void {
    this.healRuleModes.set(clusterId, modes);
  }

  isApprovalRequiredForCluster(clusterId: string, issue: IssueType): boolean {
    const modes = this.healRuleModes.get(clusterId);
    if (!modes) return false;
    return healRuleRequiresApproval(issue, modes);
  }

  setConcurrencyMode(clusterId: string, mode: "concurrent" | "sequential"): void {
    this.concurrencyModes.set(clusterId, mode);
  }

  getConcurrencyMode(clusterId: string): "concurrent" | "sequential" {
    return this.concurrencyModes.get(clusterId) ?? "concurrent";
  }

  private healingPaused = false;
  private manualHealEnabled = false;

  isHealingPaused(): boolean {
    return this.healingPaused;
  }

  isManualHealEnabled(): boolean {
    return this.manualHealEnabled;
  }

  setHealingPaused(paused: boolean): void {
    this.healingPaused = paused;
    if (paused) {
      for (const entry of this.active.values()) {
        entry.watcher.clearInflight();
      }
    }
    this.deps.log?.info(
      { paused },
      paused ? "auto-heal paused (monitoring only)" : "auto-heal resumed",
    );
  }

  setManualHealEnabled(enabled: boolean): void {
    this.manualHealEnabled = enabled;
    this.deps.log?.info(
      { enabled },
      enabled ? "manual heal mode enabled" : "manual heal mode disabled",
    );
  }

  async triggerManualHeal(
    clusterId: string,
    namespace: string,
    podName: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!this.manualHealEnabled) {
      return { ok: false, error: "Manual heal is off — click Start under Manual heal" };
    }

    const entry = this.active.get(clusterId);
    if (!entry) {
      return { ok: false, error: "Cluster watcher is not running" };
    }

    const pod = await entry.connection.readPod(podName, namespace);
    if (!pod) {
      return { ok: false, error: "Pod not found" };
    }

    const issueType = detectIssue(pod);
    if (!issueType) {
      return { ok: false, error: "No healable issue detected on this pod" };
    }

    await this.refreshHealRulesFromDb(clusterId);

    if (!this.isHealRuleEnabledForCluster(clusterId, issueType)) {
      return {
        ok: false,
        error: `Heal rule is off for ${issueType} — enable it in Rules and click Save`,
      };
    }

    await entry.watcher.inspectPod(pod, { manual: true });
    return { ok: true };
  }

  private getEnabledRuleSet(clusterId: string): Set<HealRuleId> {
    return (
      this.enabledHealRules.get(clusterId) ??
      toEnabledSet(defaultEnabledHealRules())
    );
  }

  private isHealRuleEnabledForCluster(
    clusterId: string,
    issue: IssueType,
  ): boolean {
    return this.getEnabledRuleSet(clusterId).has(issue as HealRuleId);
  }

  private isHealEnabledForCluster(clusterId: string, issue: IssueType): boolean {
    if (this.healingPaused) return false;
    return this.isHealRuleEnabledForCluster(clusterId, issue);
  }

  /** Reload enabled heal rules from DB (same source as Rules page). */
  async refreshHealRulesFromDb(clusterId: string): Promise<void> {
    const [row] = await this.deps.db
      .select({
        enabledHealRules: clusters.enabledHealRules,
        healRuleModes: clusters.healRuleModes,
        concurrencyMode: clusters.concurrencyMode,
      })
      .from(clusters)
      .where(eq(clusters.id, clusterId))
      .limit(1);

    if (!row) return;
    const enabled = normalizeStoredHealRules(row.enabledHealRules);
    this.enabledHealRules.set(clusterId, toEnabledSet(enabled));
    const modes = validateHealRuleModes(
      (row.healRuleModes as Partial<Record<string, string>> | null) ?? {},
      enabled,
    );
    this.healRuleModes.set(clusterId, modes);
    this.concurrencyModes.set(clusterId, row.concurrencyMode ?? "concurrent");
  }

  get activeClusterCount(): number {
    return this.active.size;
  }

  getRunningClusterIds(): string[] {
    return [...this.active.keys()];
  }

  async scanForHealablePods(clusterId: string): Promise<void> {
    if (this.healingPaused) return;

    const entry = this.active.get(clusterId);
    if (!entry) return;

    await entry.watcher.expireStalePendingHeals();

    const pods = await entry.connection.listPodsWithTimeout(12_000);
    if (!pods?.length) return;

    for (const pod of pods) {
      await entry.watcher.inspectPod(pod, { fromScan: true });
    }
  }

  async start(
    clusterId: string,
    opts?: { initialHealth?: ClusterHealth; deferHealthCheck?: boolean },
  ): Promise<void> {
    if (this.active.has(clusterId)) return;

    const [row] = await this.deps.db
      .select()
      .from(clusters)
      .where(eq(clusters.id, clusterId))
      .limit(1);

    if (!row) {
      throw new Error(`Cluster ${clusterId} not found`);
    }

    const kubeconfigYaml = decryptSecret(
      row.kubeconfigEncrypted,
      this.deps.env.JWT_SECRET,
    );

    const config: ClusterConfig = {
      id: row.id,
      name: row.name,
      kubeconfigBase64: kubeconfigToBase64(kubeconfigYaml),
      context: row.contextName,
      namespaceFilter: row.namespaceFilter ?? undefined,
    };

    const connection = new ClusterConnection(config, { log: this.deps.log });
    connection.connect();

    let health: ClusterHealth;
    if (opts?.initialHealth) {
      health = opts.initialHealth;
    } else if (opts?.deferHealthCheck) {
      health = {
        ok: true,
        version: "connecting",
        checkedAt: new Date().toISOString(),
      };
      void connection.healthCheck().then((healthResult) => {
        const entry = this.active.get(clusterId);
        if (!entry) return;
        entry.health = {
          ok: healthResult.ok,
          version: healthResult.version,
          checkedAt: new Date().toISOString(),
        };
      });
    } else {
      const healthResult = await connection.healthCheck();
      health = {
        ok: healthResult.ok,
        version: healthResult.version,
        checkedAt: new Date().toISOString(),
      };
    }

    const enabledRules = normalizeStoredHealRules(row.enabledHealRules);
    this.enabledHealRules.set(clusterId, toEnabledSet(enabledRules));
    const modes = validateHealRuleModes(
      (row.healRuleModes as Partial<Record<string, string>> | null) ?? {},
      enabledRules,
    );
    this.healRuleModes.set(clusterId, modes);
    this.concurrencyModes.set(clusterId, row.concurrencyMode ?? "concurrent");

    const watcherDeps: PodWatcherDeps = {
      db: this.deps.db,
      reasoner: this.reasoner,
      eventBus: this.deps.eventBus,
      log: this.deps.log,
      namespaceFilter: row.namespaceFilter ?? undefined,
      snapshot: this.podSnapshots,
      isHealEnabled: (issue) => this.isHealEnabledForCluster(clusterId, issue),
      isHealRuleEnabled: (issue) =>
        this.isHealRuleEnabledForCluster(clusterId, issue),
      isApprovalRequired: (issue) =>
        this.isApprovalRequiredForCluster(clusterId, issue),
      isHealingPaused: () => this.healingPaused,
      getConcurrencyMode: () => this.getConcurrencyMode(clusterId),
      refreshHealRules: () => this.refreshHealRulesFromDb(clusterId),
      maxMemoryLimit: this.deps.env.MAX_MEMORY_LIMIT,
    };

    const watcher = new PodWatcher(watcherDeps);
    watcher.start(connection, clusterId);

    this.active.set(clusterId, { watcher, connection, health });

    void this.seedPodSnapshot(clusterId, connection).catch((err) => {
      this.deps.log?.warn(
        { err, clusterId },
        "initial pod snapshot seed failed",
      );
    });

    await this.deps.db
      .update(clusters)
      .set({ lastConnectedAt: new Date() })
      .where(eq(clusters.id, clusterId));

    this.deps.log?.info({ clusterId }, "watcher manager started cluster");
  }

  stop(clusterId: string): void {
    const entry = this.active.get(clusterId);
    if (!entry) return;
    entry.watcher.stop();
    this.active.delete(clusterId);
    this.podSnapshots.clear(clusterId);
    this.snapshotSeeded.delete(clusterId);
    this.enabledHealRules.delete(clusterId);
    this.healRuleModes.delete(clusterId);
    this.concurrencyModes.delete(clusterId);
    this.deps.log?.info({ clusterId }, "watcher manager stopped cluster");
  }

  private async seedPodSnapshot(
    clusterId: string,
    connection: ClusterConnection,
  ): Promise<void> {
    try {
      const pods = await connection.listPodsWithTimeout(15_000);
      const activeHealKeys = await this.loadActiveHealKeys(clusterId);
      const summaries = this.podSnapshots.replace(
        clusterId,
        pods ?? [],
        activeHealKeys,
      );
      this.deps.log?.info(
        { clusterId, podCount: summaries.length },
        "pod snapshot seeded",
      );
    } finally {
      this.snapshotSeeded.add(clusterId);
    }

    void this.scanForHealablePods(clusterId).catch((err) => {
      this.deps.log?.warn({ err, clusterId }, "post-seed heal scan failed");
    });
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
        .filter((row) => !healNeedsApproval(row, this.isApprovalRequiredForCluster(clusterId, row.issueType as IssueType)))
        .map((h) => `${h.namespace}/${h.podName}`),
    );
  }

  stopAll(): void {
    for (const clusterId of [...this.active.keys()]) {
      this.stop(clusterId);
    }
  }

  async refreshHealth(clusterId: string): Promise<ClusterHealth> {
    const entry = this.active.get(clusterId);

    if (entry) {
      const result = await entry.connection.healthCheck();
      const health: ClusterHealth = {
        ok: result.ok,
        version: result.version,
        checkedAt: new Date().toISOString(),
      };
      entry.health = health;

      if (result.ok) {
        await this.deps.db
          .update(clusters)
          .set({ lastConnectedAt: new Date() })
          .where(eq(clusters.id, clusterId));
      }

      return health;
    }

    const [row] = await this.deps.db
      .select()
      .from(clusters)
      .where(eq(clusters.id, clusterId))
      .limit(1);

    if (!row) {
      throw new Error(`Cluster ${clusterId} not found`);
    }

    const kubeconfigYaml = decryptSecret(
      row.kubeconfigEncrypted,
      this.deps.env.JWT_SECRET,
    );
    const connection = new ClusterConnection(
      {
        id: row.id,
        name: row.name,
        kubeconfigBase64: kubeconfigToBase64(kubeconfigYaml),
        context: row.contextName,
        namespaceFilter: row.namespaceFilter ?? undefined,
      },
      { log: this.deps.log },
    );
    connection.connect();
    const result = await connection.healthCheck();

    return {
      ok: result.ok,
      version: result.version,
      checkedAt: new Date().toISOString(),
    };
  }
}
