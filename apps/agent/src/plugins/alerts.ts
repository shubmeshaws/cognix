import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { ServerDeps } from "../context/deps.js";
import { alerts } from "../db/schema.js";
import { ClusterNotFoundError } from "../errors/cluster.js";
import { verifyClusterOwnership } from "../services/cluster-connection.js";

export const alertsPlugin: FastifyPluginAsync<{ deps: ServerDeps }> = async (
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
      await verifyClusterOwnership(
        opts.deps.db,
        query.data.clusterId,
        request.user.userId,
      );

      const rows = await opts.deps.db
        .select()
        .from(alerts)
        .where(
          and(
            eq(alerts.clusterId, query.data.clusterId),
            isNull(alerts.resolvedAt),
          ),
        )
        .orderBy(desc(alerts.createdAt));

      return {
        alerts: rows.map((row) => ({
          id: row.id,
          clusterId: row.clusterId,
          podName: row.podName,
          namespace: row.namespace,
          message: row.message,
          severity: row.severity,
          notifiedSlack: row.notifiedSlack,
          notifiedPagerduty: row.notifiedPagerduty,
          createdAt: row.createdAt.toISOString(),
        })),
      };
    } catch (err) {
      if (err instanceof ClusterNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });
};
