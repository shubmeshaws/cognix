import { and, eq } from "drizzle-orm";

import type { ClusterConfig } from "@kubehealer/shared";
import type { Env } from "../config/env.js";
import type { Database } from "../db/client.js";
import { clusters } from "../db/schema.js";
import { ClusterNotFoundError } from "../errors/cluster.js";
import { decryptSecret } from "../lib/crypto.js";
import { kubeconfigToBase64 } from "../lib/kubeconfig.js";
import { ClusterConnection } from "../k8s/connection.js";
import type { WatcherService } from "./watcher.js";

export async function verifyClusterOwnership(
  db: Database,
  clusterId: string,
  ownerId: string,
) {
  const [row] = await db
    .select()
    .from(clusters)
    .where(and(eq(clusters.id, clusterId), eq(clusters.ownerId, ownerId)))
    .limit(1);

  if (!row) {
    throw new ClusterNotFoundError();
  }

  return row;
}

export async function getClusterConnection(
  db: Database,
  env: Env,
  clusterId: string,
  ownerId: string,
  watcher: WatcherService,
): Promise<ClusterConnection> {
  const row = await verifyClusterOwnership(db, clusterId, ownerId);

  const active = watcher.getConnection(clusterId);
  if (active) return active;

  const kubeconfigYaml = decryptSecret(row.kubeconfigEncrypted, env.JWT_SECRET);
  const inCluster = isInClusterMarker(kubeconfigYaml);

  const config: ClusterConfig = inCluster
    ? {
        id: row.id,
        name: row.name,
        inCluster: true,
        context: row.contextName,
        namespaceFilter: row.namespaceFilter ?? undefined,
      }
    : {
        id: row.id,
        name: row.name,
        kubeconfigBase64: kubeconfigToBase64(kubeconfigYaml),
        context: row.contextName,
        namespaceFilter: row.namespaceFilter ?? undefined,
      };

  const connection = new ClusterConnection(config);
  connection.connect();
  return connection;
}

function isInClusterMarker(decrypted: string): boolean {
  try {
    const parsed = JSON.parse(decrypted) as { mode?: string };
    return parsed.mode === "in_cluster";
  } catch {
    return false;
  }
}
