import type { HealRuleId, HealRuleMode } from "@kubehealer/shared";

import {
  WatcherManager,
  type ClusterHealth,
  type WatcherManagerDeps,
} from "../watcher/manager.js";

export type { ClusterHealth, WatcherManagerDeps };

/** Facade over WatcherManager for cluster registration and health APIs */
export class WatcherService {
  private readonly manager: WatcherManager;

  constructor(deps: WatcherManagerDeps) {
    this.manager = new WatcherManager(deps);
  }

  get managerInstance(): WatcherManager {
    return this.manager;
  }

  getHealth(clusterId: string): ClusterHealth | null {
    return this.manager.getHealth(clusterId);
  }

  isRunning(clusterId: string): boolean {
    return this.manager.isRunning(clusterId);
  }

  getConnection(clusterId: string) {
    return this.manager.getConnection(clusterId);
  }

  getPodSummaries(clusterId: string) {
    return this.manager.getPodSummaries(clusterId);
  }

  waitForPodSnapshot(clusterId: string, maxWaitMs?: number) {
    return this.manager.waitForPodSnapshot(clusterId, maxWaitMs);
  }

  isSnapshotReady(clusterId: string): boolean {
    return this.manager.isSnapshotReady(clusterId);
  }

  syncPodSnapshot(
    clusterId: string,
    pods: import("@kubernetes/client-node").V1Pod[],
    activeHealKeys: Set<string>,
  ) {
    return this.manager.syncPodSnapshot(clusterId, pods, activeHealKeys);
  }

  get activeClusterCount(): number {
    return this.manager.activeClusterCount;
  }

  getRunningClusterIds(): string[] {
    return this.manager.getRunningClusterIds();
  }

  scanForHealablePods(clusterId: string): Promise<void> {
    return this.manager.scanForHealablePods(clusterId);
  }

  start(
    clusterId: string,
    opts?: { initialHealth?: ClusterHealth; deferHealthCheck?: boolean },
  ): Promise<void> {
    return this.manager.start(clusterId, opts);
  }

  stop(clusterId: string): void {
    this.manager.stop(clusterId);
  }

  stopAll(): void {
    this.manager.stopAll();
  }

  refreshHealth(clusterId: string): Promise<ClusterHealth> {
    return this.manager.refreshHealth(clusterId);
  }

  setEnabledHealRules(clusterId: string, rules: HealRuleId[]): void {
    this.manager.setEnabledHealRules(clusterId, rules);
  }

  setHealRuleModes(
    clusterId: string,
    modes: Record<HealRuleId, HealRuleMode>,
  ): void {
    this.manager.setHealRuleModes(clusterId, modes);
  }

  isHealingPaused(): boolean {
    return this.manager.isHealingPaused();
  }

  setHealingPaused(paused: boolean): void {
    this.manager.setHealingPaused(paused);
  }

  isManualHealEnabled(): boolean {
    return this.manager.isManualHealEnabled();
  }

  setManualHealEnabled(enabled: boolean): void {
    this.manager.setManualHealEnabled(enabled);
  }

  triggerManualHeal(
    clusterId: string,
    namespace: string,
    podName: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    return this.manager.triggerManualHeal(clusterId, namespace, podName);
  }

  refreshHealRulesFromDb(clusterId: string): Promise<void> {
    return this.manager.refreshHealRulesFromDb(clusterId);
  }

  isApprovalRequiredForCluster(
    clusterId: string,
    issue: import("../watcher/detectIssue.js").IssueType,
  ): boolean {
    return this.manager.isApprovalRequiredForCluster(clusterId, issue);
  }

  setConcurrencyMode(
    clusterId: string,
    mode: "concurrent" | "sequential",
  ): void {
    this.manager.setConcurrencyMode(clusterId, mode);
  }

  setHealJobPods(clusterId: string, enabled: boolean): void {
    this.manager.setHealJobPods(clusterId, enabled);
  }

  isHealJobPodsEnabledForCluster(clusterId: string): boolean {
    return this.manager.isHealJobPodsEnabledForCluster(clusterId);
  }

  setHealWorkerPods(clusterId: string, enabled: boolean): void {
    this.manager.setHealWorkerPods(clusterId, enabled);
  }

  isHealWorkerPodsEnabledForCluster(clusterId: string): boolean {
    return this.manager.isHealWorkerPodsEnabledForCluster(clusterId);
  }
}
