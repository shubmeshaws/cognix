import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { z } from "zod";

import type { Env } from "./config/env.js";
import { loadIntegrationsFromDisk } from "./config/integrations-store.js";
import { loadLlmConfigFromDisk } from "./config/llm-config-store.js";
import type { ServerDeps } from "./context/deps.js";
import { createDb } from "./db/client.js";
import { clusters } from "./db/schema.js";
import { AgentEventBus } from "./events/bus.js";
import { HealOrchestrator } from "./healer/orchestrator.js";
import { agentStatusPlugin } from "./plugins/agent-status.js";
import { alertsPlugin } from "./plugins/alerts.js";
import { authPlugin } from "./plugins/auth.js";
import { clustersPlugin } from "./plugins/clusters.js";
import { healsPlugin } from "./plugins/heals.js";
import { podsPlugin } from "./plugins/pods.js";
import { nodesPlugin } from "./plugins/nodes.js";
import { copilotPlugin } from "./plugins/copilot.js";
import { runHealPipeline } from "./services/heal-pipeline.js";
import { ClusterRegistryService } from "./services/clusters.js";
import { WatcherService } from "./services/watcher.js";
import { ClusterWebSocketHub } from "./ws/cluster-hub.js";

export type { ServerDeps } from "./context/deps.js";

export interface BuildServerResult {
  app: ReturnType<typeof Fastify>;
  deps: ServerDeps;
  pool: Awaited<ReturnType<typeof createDb>>["pool"];
}

export async function buildServer(env: Env): Promise<BuildServerResult> {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL ?? "info" },
  });

  await loadIntegrationsFromDisk();
  await loadLlmConfigFromDisk();
  const { getEffectiveTeamsWebhookUrl } = await import(
    "./services/teams-config.js"
  );
  if (getEffectiveTeamsWebhookUrl(env)) {
    app.log.info("Microsoft Teams webhook configured for heal notifications");
  }

  const { db, pool } = createDb(env.DATABASE_URL);
  const eventBus = new AgentEventBus();
  const clusterHub = new ClusterWebSocketHub();
  const watcher = new WatcherService({ db, env, eventBus, log: app.log });
  const clusterService = new ClusterRegistryService(
    db,
    env.JWT_SECRET,
    watcher,
  );
  const orchestrator = new HealOrchestrator({
    db,
    env,
    clusterHub,
    log: app.log,
  });

  const deps: ServerDeps = {
    db,
    env,
    eventBus,
    clusterHub,
    watcher,
    clusterService,
    orchestrator,
    startedAt: Date.now(),
  };

  wireEventBroadcasts(deps, app.log);

  await app.register(cors, { origin: true });
  await app.register(websocket);
  await app.register(authPlugin, { env });

  await app.register(clustersPlugin, {
    prefix: "/api/clusters",
    env,
    clusterService,
  });

  await app.register(podsPlugin, { prefix: "/api/pods", deps });
  await app.register(nodesPlugin, { prefix: "/api/nodes", deps });
  await app.register(healsPlugin, { prefix: "/api/heals", deps });
  await app.register(alertsPlugin, { prefix: "/api/alerts", deps });
  await app.register(agentStatusPlugin, { prefix: "/api/agent", deps });
  await app.register(copilotPlugin, { prefix: "/api/copilot", deps });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/ws", { websocket: true }, (socket, request) => {
    const query = z
      .object({
        clusterId: z.string().uuid(),
        token: z.string().min(1),
      })
      .safeParse(request.query);

    if (!query.success) {
      socket.close(1008, "clusterId and token are required");
      return;
    }

    void verifyWsToken(app, query.data.token)
      .then(() => {
        clusterHub.register(query.data.clusterId, socket);
        socket.send(
          JSON.stringify({
            type: "connected",
            clusterId: query.data.clusterId,
          }),
        );

        socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
          const text = Buffer.isBuffer(raw) ? raw.toString() : String(raw);
          try {
            const msg = JSON.parse(text) as { type?: string };
            if (msg.type === "ping") {
              socket.send(JSON.stringify({ type: "pong" }));
            }
          } catch {
            // ignore malformed client messages
          }
        });
      })
      .catch(() => {
        socket.close(1008, "Unauthorized");
      });
  });

  app.decorate("deps", deps);
  app.decorate("clusterHub", clusterHub);
  app.decorate("db", db);

  let healScanTimer: ReturnType<typeof setInterval> | null = null;

  app.addHook("onReady", async () => {
    const rows = await db.select({ id: clusters.id }).from(clusters);
    for (const row of rows) {
      watcher.start(row.id).catch((err) => {
        app.log.warn({ err, clusterId: row.id }, "failed to resume cluster watcher");
      });
    }
    if (rows.length > 0) {
      app.log.info({ count: rows.length }, "resuming cluster watchers");
    }

    const HEAL_SCAN_INTERVAL_MS = 45_000;
    healScanTimer = setInterval(() => {
      for (const clusterId of watcher.getRunningClusterIds()) {
        void watcher.scanForHealablePods(clusterId).catch((err) => {
          app.log.warn({ err, clusterId }, "periodic heal scan failed");
        });
      }
    }, HEAL_SCAN_INTERVAL_MS);
  });

  app.addHook("onClose", async () => {
    if (healScanTimer) clearInterval(healScanTimer);
    watcher.stopAll();
    await pool.end();
  });

  return { app, deps, pool };
}

async function verifyWsToken(
  app: ReturnType<typeof Fastify>,
  token: string,
): Promise<void> {
  await app.jwt.verify(token);
}

function wireEventBroadcasts(
  deps: ServerDeps,
  log: {
    info: (obj: object, msg?: string) => void;
    warn: (obj: object, msg?: string) => void;
    error: (obj: object, msg?: string) => void;
  },
): void {
  deps.eventBus.onIssueDetected((payload) => {
    log.info(
      {
        clusterId: payload.clusterId,
        healRecordId: payload.healRecordId,
        pod: `${payload.namespace}/${payload.podName}`,
        issueType: payload.issueType,
        safeToAutoHeal: payload.diagnosis.safeToAutoHeal,
        action: payload.diagnosis.action,
      },
      "issue:detected",
    );

    void runHealPipeline(deps, payload, log);
  });
}

/** Broadcast helper exposed for internal services */
export function broadcastToCluster(
  deps: ServerDeps,
  clusterId: string,
  event: Parameters<ClusterWebSocketHub["broadcastToCluster"]>[1],
): void {
  deps.clusterHub.broadcastToCluster(clusterId, event);
}
