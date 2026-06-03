import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { Env } from "../config/env.js";
import {
  ClusterDuplicateNameError,
  ClusterNotFoundError,
} from "../errors/cluster.js";
import { readLocalKubeconfig } from "../lib/local-kubeconfig.js";
import { normalizeUserId } from "../lib/user-id.js";
import type { ClusterRegistryService } from "../services/clusters.js";
import { registrationService } from "../services/registrations.js";

const connectBodySchema = z.object({
  name: z.string().min(1).max(128),
  kubeconfig: z.string().min(1),
  contextName: z.string().min(1).optional(),
  namespaceFilter: z.array(z.string().min(1)).optional(),
});

const localConnectBodySchema = z.object({
  name: z.string().min(1).max(128),
  contextName: z.string().min(1).optional(),
  namespaceFilter: z.array(z.string().min(1)).optional(),
});

const registrationBodySchema = z.object({
  name: z.string().min(1).max(128),
  namespaceFilter: z.array(z.string().min(1)).optional(),
});

function connectFailureStatus(err: unknown): number {
  return err instanceof ClusterDuplicateNameError ? 409 : 400;
}

const inClusterConnectSchema = z.object({
  inCluster: z.literal(true),
  token: z.string().min(16),
  version: z.string().optional(),
  nodeCount: z.number().int().nonnegative().nullable().optional(),
  namespaces: z.array(z.string()).optional(),
});

/** @deprecated Job-based bootstrap; prefer POST /connect with inCluster */
const agentConnectSchema = z
  .object({
    registerToken: z.string().min(16),
    name: z.string().min(1).max(128),
    kubeconfig: z.string().min(1).optional(),
    kubeconfigBase64: z.string().min(1).optional(),
    inCluster: z.literal(true).optional(),
    contextName: z.string().min(1).optional(),
    namespaceFilter: z.array(z.string().min(1)).optional(),
  })
  .refine((d) => Boolean(d.kubeconfig || d.kubeconfigBase64), {
    message: "kubeconfig or kubeconfigBase64 is required",
  });

export const clustersPlugin: FastifyPluginAsync<{
  env: Env;
  clusterService: ClusterRegistryService;
}> = async (app, opts) => {
  app.post("/connect", async (request, reply) => {
    const inCluster = inClusterConnectSchema.safeParse(request.body);
    if (inCluster.success) {
      const pending = registrationService.consumeForAgent(inCluster.data.token);
      if (!pending) {
        return reply.code(400).send({ error: "Invalid or expired cluster token" });
      }

      try {
        const result = await opts.clusterService.connectInCluster({
          token: inCluster.data.token,
          ownerId: pending.ownerId,
          name: pending.clusterName,
          namespaceFilter: pending.namespaceFilter,
          version: inCluster.data.version,
          nodeCount: inCluster.data.nodeCount,
          namespaces: inCluster.data.namespaces,
        });

        registrationService.complete(inCluster.data.token, result);
        return reply.code(201).send(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to connect cluster";
        return reply.code(connectFailureStatus(err)).send({ error: message });
      }
    }

    try {
      await request.jwtVerify();
      request.user.userId = normalizeUserId(request.user.userId);
    } catch {
      return reply.code(401).send({
        error:
          "Unauthorized — use { inCluster: true, token } for in-cluster agents or Bearer token for kubeconfig upload",
      });
    }

    const parsed = connectBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { name, kubeconfig, contextName, namespaceFilter } = parsed.data;

    try {
      const result = await opts.clusterService.connect({
        name,
        kubeconfig,
        contextName,
        namespaceFilter,
        ownerId: request.user.userId,
      });

      return reply.code(201).send(result);
    } catch (err) {
      request.log.error(
        { err, name, contextName },
        "cluster connect failed",
      );
      const message =
        err instanceof Error ? err.message : "Failed to connect cluster";
      return reply.code(connectFailureStatus(err)).send({ error: message });
    }
  });

  app.post("/connect/agent", async (request, reply) => {
    const parsed = agentConnectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const pending = registrationService.consumeForAgent(parsed.data.registerToken);
    if (!pending) {
      return reply.code(400).send({ error: "Invalid or expired registration token" });
    }

    try {
      const kubeconfig = parsed.data.kubeconfig
        ? parsed.data.kubeconfig
        : Buffer.from(parsed.data.kubeconfigBase64!, "base64").toString("utf-8");

      const result = await opts.clusterService.connect({
        name: parsed.data.name,
        kubeconfig,
        contextName: parsed.data.contextName,
        namespaceFilter:
          parsed.data.namespaceFilter ?? pending.namespaceFilter,
        ownerId: pending.ownerId,
      });

      registrationService.complete(parsed.data.registerToken, result);
      return reply.code(201).send(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect cluster";
      return reply.code(connectFailureStatus(err)).send({ error: message });
    }
  });

  await app.register(async (scoped) => {
    scoped.addHook("onRequest", app.authenticate);

    scoped.post("/registration", async (request, reply) => {
      const parsed = registrationBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        await opts.clusterService.assertUniqueClusterName(
          request.user.userId,
          parsed.data.name,
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Cluster name already in use";
        return reply.code(connectFailureStatus(err)).send({ error: message });
      }

      const { token, expiresAt } = registrationService.create({
        ownerId: request.user.userId,
        clusterName: parsed.data.name,
        namespaceFilter: parsed.data.namespaceFilter,
      });

      return {
        token,
        clusterToken: token,
        expiresAt,
      };
    });

    scoped.get("/registration/:token", async (request, reply) => {
      const params = z
        .object({ token: z.string().min(16) })
        .safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Invalid token" });
      }

      const status = registrationService.statusForOwner(
        params.data.token,
        request.user.userId,
      );
      if (!status) {
        return reply.code(404).send({ error: "Registration not found" });
      }
      return status;
    });

    scoped.post("/connect/local", async (request, reply) => {
      if (!opts.env.ALLOW_LOCAL_KUBECONFIG) {
        return reply.code(404).send({
          error:
            "Local kubeconfig is disabled. Set ALLOW_LOCAL_KUBECONFIG=true on the agent.",
        });
      }

      const parsed = localConnectBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.flatten() });
      }

      try {
        const result = await opts.clusterService.connectLocal({
          name: parsed.data.name,
          contextName: parsed.data.contextName,
          namespaceFilter: parsed.data.namespaceFilter,
          ownerId: request.user.userId,
        });
        return reply.code(201).send(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to connect cluster";
        return reply.code(connectFailureStatus(err)).send({ error: message });
      }
    });

    scoped.get("/local-kubeconfig", async (_request, reply) => {
      if (!opts.env.ALLOW_LOCAL_KUBECONFIG) {
        return reply.code(404).send({
          error:
            "Local kubeconfig is disabled. Set ALLOW_LOCAL_KUBECONFIG=true on the agent.",
        });
      }

      try {
        return readLocalKubeconfig();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to read local kubeconfig";
        return reply.code(400).send({ error: message });
      }
    });

    const listClusters = async (request: { user: { userId: string } }) =>
      opts.clusterService.listForUser(request.user.userId);

    // List route must be explicit — bare `/api/clusters` does not match `GET /` in Fastify.
    scoped.get("/list", listClusters);

    scoped.delete("/:id", async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Invalid cluster id" });
      }

      try {
        await opts.clusterService.deleteForUser(
          params.data.id,
          request.user.userId,
        );
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof ClusterNotFoundError) {
          return reply.code(404).send({ error: err.message });
        }
        throw err;
      }
    });

    scoped.get("/:id/heal-rules", async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Invalid cluster id" });
      }

      try {
        return await opts.clusterService.getHealRulesForUser(
          params.data.id,
          request.user.userId,
        );
      } catch (err) {
        if (err instanceof ClusterNotFoundError) {
          return reply.code(404).send({ error: err.message });
        }
        throw err;
      }
    });

    scoped.patch("/:id/heal-rules", async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      const body = z
        .object({
          enabled: z.array(z.string().min(1)).min(1),
          modes: z.record(z.enum(["auto", "approval"])).optional(),
          concurrencyMode: z.enum(["concurrent", "sequential"]).optional(),
          healJobPods: z.boolean().optional(),
          healWorkerPods: z.boolean().optional(),
        })
        .safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.code(400).send({ error: "Invalid cluster id or body" });
      }

      try {
        return await opts.clusterService.updateHealRulesForUser(
          params.data.id,
          request.user.userId,
          body.data.enabled,
          body.data.modes,
          body.data.concurrencyMode,
          body.data.healJobPods,
          body.data.healWorkerPods,
        );
      } catch (err) {
        if (err instanceof ClusterNotFoundError) {
          return reply.code(404).send({ error: err.message });
        }
        const message = err instanceof Error ? err.message : "Failed to update rules";
        return reply.code(400).send({ error: message });
      }
    });

    scoped.get("/:id/health", async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Invalid cluster id" });
      }

      try {
        const health = await opts.clusterService.getHealthForUser(
          params.data.id,
          request.user.userId,
        );
        return health;
      } catch (err) {
        if (err instanceof ClusterNotFoundError) {
          return reply.code(404).send({ error: err.message });
        }
        throw err;
      }
    });
  });
};
