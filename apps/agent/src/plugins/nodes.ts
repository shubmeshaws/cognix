import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { V1Node } from "@kubernetes/client-node";

import { ClusterNotFoundError } from "../errors/cluster.js";
import { getClusterConnection } from "../services/cluster-connection.js";
import type { ServerDeps } from "../context/deps.js";

function getNodeRoles(labels: Record<string, string> | undefined): string[] {
  if (!labels) return ["worker"];
  const roles: string[] = [];
  for (const key of Object.keys(labels)) {
    if (key.startsWith("node-role.kubernetes.io/")) {
      const role = key.split("/")[1];
      if (role) roles.push(role);
    }
  }
  return roles.length > 0 ? roles : ["worker"];
}

function getNodeColor(conditions: any[] | undefined): "red" | "green" | "blue" {
  if (!conditions) return "blue";
  const readyCond = conditions.find(c => c.type === "Ready");
  if (!readyCond || readyCond.status === "Unknown") {
    return "blue";
  }
  if (readyCond.status === "False") {
    return "red";
  }
  const hasPressure = conditions.some(c => 
    ["MemoryPressure", "DiskPressure", "PIDPressure", "NetworkUnavailable"].includes(c.type) && 
    c.status === "True"
  );
  if (hasPressure) {
    return "red";
  }
  return "green";
}

export const nodesPlugin: FastifyPluginAsync<{ deps: ServerDeps }> = async (
  app,
  opts,
) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (request, reply) => {
    const query = z
      .object({ clusterId: z.string().uuid() })
      .safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send({ error: "clusterId is required" });
    }

    try {
      const clusterId = query.data.clusterId;
      if (!opts.deps.watcher.isRunning(clusterId)) {
        void opts.deps.watcher
          .start(clusterId, { deferHealthCheck: true })
          .catch((err) => {
            request.log.warn({ err, clusterId }, "background watcher start failed");
          });
      }

      const connection = await getClusterConnection(
        opts.deps.db,
        opts.deps.env,
        query.data.clusterId,
        request.user.userId,
        opts.deps.watcher,
      );

      const nodeList = await connection.listNodes();
      if (!nodeList) {
        return { nodes: [] };
      }

      const nodes = nodeList.map((node: V1Node) => {
        const name = node.metadata?.name ?? "unknown";
        const creationTimestamp = node.metadata?.creationTimestamp;
        const labels = node.metadata?.labels ?? {};
        const conditions = node.status?.conditions ?? [];
        
        const readyCond = conditions.find(c => c.type === "Ready");
        const status = readyCond?.status === "True" ? "Ready" : readyCond?.status === "False" ? "NotReady" : "Unknown";
        const color = getNodeColor(conditions);

        const cpuCapacity = node.status?.capacity?.cpu ?? "unknown";
        const cpuAllocatable = node.status?.allocatable?.cpu ?? "unknown";
        const memoryCapacity = node.status?.capacity?.memory ?? "unknown";
        const memoryAllocatable = node.status?.allocatable?.memory ?? "unknown";

        const nodeInfo = node.status?.nodeInfo;
        const kubeletVersion = nodeInfo?.kubeletVersion ?? "unknown";
        const osImage = nodeInfo?.osImage ?? "unknown";
        const architecture = nodeInfo?.architecture ?? "unknown";
        const operatingSystem = nodeInfo?.operatingSystem ?? "unknown";

        const addresses = (node.status?.addresses ?? []).map(a => ({
          type: a.type,
          address: a.address,
        }));

        return {
          name,
          status,
          color,
          roles: getNodeRoles(labels),
          conditions: conditions.map(c => ({
            type: c.type,
            status: c.status,
            message: c.message ?? "",
            reason: c.reason ?? "",
          })),
          cpuCapacity,
          cpuAllocatable,
          memoryCapacity,
          memoryAllocatable,
          kubeletVersion,
          osImage,
          architecture,
          operatingSystem,
          addresses,
          createdAt: creationTimestamp ? new Date(creationTimestamp).toISOString() : undefined,
        };
      });

      return { nodes };
    } catch (err) {
      if (err instanceof ClusterNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });
};
