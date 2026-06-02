import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { ClusterNotFoundError } from "../errors/cluster.js";
import { getClusterConnection } from "../services/cluster-connection.js";
import { listPodSummaries } from "../services/pod-summaries.js";
import type { PodSummary } from "../watcher/pod-snapshot.js";
import type { ServerDeps } from "../context/deps.js";

export type { PodSummary };

export const podsPlugin: FastifyPluginAsync<{ deps: ServerDeps }> = async (
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

      const summaries = await listPodSummaries(
        opts.deps.db,
        opts.deps.watcher,
        query.data.clusterId,
        connection,
      );

      return { pods: summaries };
    } catch (err) {
      if (err instanceof ClusterNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get("/:name/logs", async (request, reply) => {
    const params = z.object({ name: z.string().min(1) }).safeParse(request.params);
    const query = z
      .object({
        clusterId: z.string().uuid(),
        ns: z.string().min(1),
      })
      .safeParse(request.query);

    if (!params.success || !query.success) {
      return reply.code(400).send({ error: "name, clusterId, and ns are required" });
    }

    try {
      const connection = await getClusterConnection(
        opts.deps.db,
        opts.deps.env,
        query.data.clusterId,
        request.user.userId,
        opts.deps.watcher,
      );

      const logs =
        (await connection.getPodLogs(params.data.name, query.data.ns, false, 100)) ??
        "";

      return { logs };
    } catch (err) {
      if (err instanceof ClusterNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });

  app.post("/heal", async (request, reply) => {
    const body = z
      .object({
        clusterId: z.string().uuid(),
        namespace: z.string().min(1),
        podName: z.string().min(1),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    try {
      const { clusterId, namespace, podName } = body.data;

      if (!opts.deps.watcher.isRunning(clusterId)) {
        void opts.deps.watcher
          .start(clusterId, { deferHealthCheck: true })
          .catch((err) => {
            request.log.warn({ err, clusterId }, "background watcher start failed");
          });
        await new Promise((r) => setTimeout(r, 500));
      }

      await getClusterConnection(
        opts.deps.db,
        opts.deps.env,
        clusterId,
        request.user.userId,
        opts.deps.watcher,
      );

      const result = await opts.deps.watcher.triggerManualHeal(
        clusterId,
        namespace,
        podName,
      );

      if (!result.ok) {
        return reply.code(400).send({ error: result.error });
      }

      return { ok: true as const, podName, namespace };
    } catch (err) {
      if (err instanceof ClusterNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });
};
