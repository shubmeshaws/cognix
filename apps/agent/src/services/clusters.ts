import { and, eq } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { clusters, users } from "../db/schema.js";
import {
  ClusterDuplicateNameError,
  ClusterNotFoundError,
} from "../errors/cluster.js";
import { encryptSecret } from "../lib/crypto.js";
import { readLocalKubeconfig } from "../lib/local-kubeconfig.js";
import { DEV_USER_ID } from "../lib/user-id.js";
import {
  kubeconfigToBase64,
  parseKubeconfig,
} from "../lib/kubeconfig.js";
import { AuthError, ConnectionError } from "../k8s/errors.js";
import { raceTimeout } from "../lib/timeout.js";
import { ClusterConnection } from "../k8s/connection.js";
import {
  HEAL_RULE_CATALOG,
  approvalHealRulesFromModes,
  buildHealRulesState,
  type HealRuleId,
  type HealRuleMode,
} from "@kubehealer/shared";

import type { ClusterHealth, WatcherService } from "./watcher.js";
import {
  defaultEnabledHealRules,
  normalizeStoredHealRules,
  validateHealRuleModes,
  validateHealRuleUpdate,
} from "./heal-rules.js";

export interface ConnectClusterInput {
  name: string;
  kubeconfig: string;
  contextName?: string;
  namespaceFilter?: string[];
  ownerId: string;
}

export interface ConnectInClusterInput {
  token: string;
  ownerId: string;
  name: string;
  namespaceFilter?: string[];
  version?: string;
  nodeCount?: number | null;
  namespaces?: string[];
}

const IN_CLUSTER_KUBECONFIG_MARKER = JSON.stringify({ mode: "in_cluster" });

export interface ConnectClusterResult {
  clusterId: string;
  serverUrl: string;
  version: string;
  nodeCount: number | null;
  namespaces: string[];
}

export interface ClusterListItem {
  id: string;
  name: string;
  serverUrl: string;
  contextName: string;
  lastConnectedAt: string | null;
  health: ClusterHealth | { ok: false; version: string; checkedAt: string | null };
}

export class ClusterRegistryService {
  constructor(
    private readonly db: Database,
    private readonly jwtSecret: string,
    private readonly watcher: WatcherService,
  ) {}

  /** Case-insensitive name check per owner — blocks duplicate cluster rows. */
  async assertUniqueClusterName(ownerId: string, name: string): Promise<void> {
    const want = name.trim().toLowerCase();
    if (!want) {
      throw new Error("Cluster name is required");
    }

    const rows = await this.db
      .select({ name: clusters.name })
      .from(clusters)
      .where(eq(clusters.ownerId, ownerId));

    const duplicate = rows.some(
      (r) => r.name.trim().toLowerCase() === want,
    );
    if (duplicate) {
      throw new ClusterDuplicateNameError(name.trim());
    }
  }

  private async ensureOwner(ownerId: string): Promise<void> {
    const email =
      ownerId === DEV_USER_ID
        ? "dev@local"
        : `owner-${ownerId.slice(0, 8)}@kubehealer.local`;
    await this.db
      .insert(users)
      .values({
        id: ownerId,
        email,
        name: "Dev user",
      })
      .onConflictDoNothing({ target: users.id });
  }

  async connectInCluster(
    input: ConnectInClusterInput,
  ): Promise<ConnectClusterResult> {
    await this.ensureOwner(input.ownerId);
    await this.assertUniqueClusterName(input.ownerId, input.name);
    const encrypted = encryptSecret(IN_CLUSTER_KUBECONFIG_MARKER, this.jwtSecret);

    const [row] = await this.db
      .insert(clusters)
      .values({
        name: input.name,
        kubeconfigEncrypted: encrypted,
        serverUrl: "in-cluster://kubehealer-system",
        contextName: "in-cluster",
        namespaceFilter: input.namespaceFilter?.length
          ? input.namespaceFilter
          : null,
        ownerId: input.ownerId,
        lastConnectedAt: new Date(),
        enabledHealRules: defaultEnabledHealRules(),
      })
      .returning();

    // Watcher runs inside the cluster Deployment; SaaS does not pull kubeconfig.
    return {
      clusterId: row.id,
      serverUrl: row.serverUrl,
      version: input.version ?? "unknown",
      nodeCount: input.nodeCount ?? null,
      namespaces: input.namespaces ?? [],
    };
  }

  async connectLocal(
    input: Omit<ConnectClusterInput, "kubeconfig">,
  ): Promise<ConnectClusterResult> {
    const local = readLocalKubeconfig();
    return this.connect({
      ...input,
      kubeconfig: local.kubeconfig,
      contextName: input.contextName ?? local.currentContext ?? undefined,
    });
  }

  async connect(input: ConnectClusterInput): Promise<ConnectClusterResult> {
    await this.ensureOwner(input.ownerId);
    await this.assertUniqueClusterName(input.ownerId, input.name);
    try {
      const parsed = parseKubeconfig(input.kubeconfig, input.contextName);

      const probe = new ClusterConnection({
        id: "probe",
        name: input.name,
        kubeconfigBase64: kubeconfigToBase64(input.kubeconfig),
        context: parsed.contextName,
        namespaceFilter: input.namespaceFilter,
      });
      probe.connect();

      const health = await probe.healthCheck();
      if (!health.ok) {
        throw new Error("Cluster health check failed");
      }

      const namespaces = await raceTimeout(
        probe.listNamespacesForWatch(),
        3_000,
        input.namespaceFilter?.length ? input.namespaceFilter : ["default"],
      );

      const encrypted = encryptSecret(input.kubeconfig, this.jwtSecret);

      const [row] = await this.db
        .insert(clusters)
        .values({
          name: input.name,
          kubeconfigEncrypted: encrypted,
          serverUrl: parsed.serverUrl,
          contextName: parsed.contextName,
          namespaceFilter: input.namespaceFilter?.length
            ? input.namespaceFilter
            : null,
          ownerId: input.ownerId,
          lastConnectedAt: new Date(),
          enabledHealRules: defaultEnabledHealRules(),
        })
        .returning();

      const initialHealth: ClusterHealth = {
        ok: true,
        version: health.version,
        checkedAt: new Date().toISOString(),
      };

      void this.watcher.start(row.id, { initialHealth }).catch(() => {
        // Watcher will retry on agent restart; connect response stays fast.
      });

      const nodeCount = await raceTimeout(probe.listNodeCount(), 2_000, null);

      return {
        clusterId: row.id,
        serverUrl: parsed.serverUrl,
        version: health.version,
        nodeCount,
        namespaces,
      };
    } catch (err) {
      throw mapConnectError(err);
    }
  }

  async listForUser(ownerId: string): Promise<ClusterListItem[]> {
    const rows = await this.db
      .select()
      .from(clusters)
      .where(eq(clusters.ownerId, ownerId));

    return rows.map((row) => {
      const cached = this.watcher.getHealth(row.id);
      return {
        id: row.id,
        name: row.name,
        serverUrl: row.serverUrl,
        contextName: row.contextName,
        lastConnectedAt: row.lastConnectedAt?.toISOString() ?? null,
        health: cached ?? {
          ok: false,
          version: "unknown",
          checkedAt: null,
        },
      };
    });
  }

  async deleteForUser(clusterId: string, ownerId: string): Promise<void> {
    const row = await this.getOwnedCluster(clusterId, ownerId);
    this.watcher.stop(row.id);
    await this.db.delete(clusters).where(eq(clusters.id, clusterId));
  }

  async getHealthForUser(
    clusterId: string,
    ownerId: string,
  ): Promise<ClusterHealth> {
    await this.getOwnedCluster(clusterId, ownerId);
    return this.watcher.refreshHealth(clusterId);
  }

  async getHealRulesForUser(clusterId: string, ownerId: string) {
    const row = await this.getOwnedCluster(clusterId, ownerId);
    const enabled = normalizeStoredHealRules(row.enabledHealRules);
    const modes = validateHealRuleModes(
      (row.healRuleModes as Partial<Record<string, string>> | null) ?? {},
      enabled,
    );
    return {
      clusterId: row.id,
      catalog: HEAL_RULE_CATALOG,
      enabled,
      rules: buildHealRulesState(enabled),
      modes,
      approvalRules: approvalHealRulesFromModes(modes),
      concurrencyMode: row.concurrencyMode,
    };
  }

  async updateHealRulesForUser(
    clusterId: string,
    ownerId: string,
    ruleIds: string[],
    modesInput?: Record<string, string>,
    concurrencyModeInput?: "concurrent" | "sequential",
  ) {
    const parsed = validateHealRuleUpdate(ruleIds);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    await this.getOwnedCluster(clusterId, ownerId);

    const modes = validateHealRuleModes(modesInput, parsed.enabled);

    const [row] = await this.db
      .update(clusters)
      .set({
        enabledHealRules: parsed.enabled,
        healRuleModes: modes,
        ...(concurrencyModeInput && { concurrencyMode: concurrencyModeInput }),
      })
      .where(and(eq(clusters.id, clusterId), eq(clusters.ownerId, ownerId)))
      .returning();

    if (!row) {
      throw new ClusterNotFoundError();
    }

    this.watcher.setEnabledHealRules(clusterId, parsed.enabled);
    this.watcher.setHealRuleModes(clusterId, modes);
    if (concurrencyModeInput) {
      this.watcher.setConcurrencyMode(clusterId, concurrencyModeInput);
    }
    void this.watcher.scanForHealablePods(clusterId).catch(() => {
      // scan is best-effort after rules change
    });

    return {
      clusterId: row.id,
      catalog: HEAL_RULE_CATALOG,
      enabled: parsed.enabled,
      rules: buildHealRulesState(parsed.enabled),
      modes,
      approvalRules: approvalHealRulesFromModes(modes),
      concurrencyMode: row.concurrencyMode,
    };
  }

  private async getOwnedCluster(clusterId: string, ownerId: string) {
    const [row] = await this.db
      .select()
      .from(clusters)
      .where(and(eq(clusters.id, clusterId), eq(clusters.ownerId, ownerId)))
      .limit(1);

    if (!row) {
      throw new ClusterNotFoundError();
    }

    return row;
  }
}


function mapConnectError(err: unknown): Error {
  if (err instanceof ClusterDuplicateNameError) {
    return err;
  }
  if (err instanceof AuthError) {
    return new Error(
      `Authentication failed (${err.statusCode}): check credentials in kubeconfig`,
    );
  }
  if (err instanceof ConnectionError) {
    return new Error(`Network unreachable: ${err.message}`);
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("etimedout") ||
      msg.includes("fetch failed") ||
      msg.includes("network")
    ) {
      return new Error(`Network unreachable: ${err.message}`);
    }
    if (msg.includes("unauthorized") || msg.includes("401") || msg.includes("403")) {
      return new Error(`Authentication failed: ${err.message}`);
    }
    return err;
  }
  return new Error("Failed to connect cluster");
}
