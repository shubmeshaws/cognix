import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Env } from "../config/env.js";
import { ClusterWebSocketHub } from "../ws/cluster-hub.js";
import { HealOrchestrator } from "./orchestrator.js";
import type { HealRecord } from "./types.js";
import type { ClusterConnection } from "../k8s/connection.js";

const env: Env = {
  PORT: 3001,
  DATABASE_URL: "postgresql://localhost:5432/kubehealer",
  REDIS_URL: "redis://localhost:6379",
  OLLAMA_URL: "http://localhost:11434",
  JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
  MAX_MEMORY_LIMIT: "4Gi",
};

function baseRecord(overrides: Partial<HealRecord> = {}): HealRecord {
  return {
    id: "heal-1",
    clusterId: "cluster-1",
    podName: "api-abc",
    namespace: "default",
    issueType: "CrashLoop",
    severity: "high",
    llmReasoning: "Container crash loop",
    actionTaken: "restart",
    status: "pending",
    durationMs: 0,
    beforeState: { safeToAutoHeal: true },
    afterState: {},
    approvedBy: null,
    ...overrides,
  };
}

describe("HealOrchestrator", () => {
  it("skips execution when safeToAutoHeal is false", async () => {
    const terminalEvents: unknown[] = [];
    const hub = new ClusterWebSocketHub();
    const originalBroadcast = hub.broadcastToCluster.bind(hub);
    hub.broadcastToCluster = (_clusterId, e) => {
      terminalEvents.push(e);
    };

    const db = {
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: "line-1" }],
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [
              {
                ...baseRecord({
                  beforeState: { safeToAutoHeal: false, approvalRequired: true },
                }),
                status: "pending",
                durationMs: 10,
              },
            ],
          }),
        }),
      }),
    };

    const orchestrator = new HealOrchestrator({
      db: db as never,
      env,
      clusterHub: hub,
    });

    const result = await orchestrator.execute(
      baseRecord({ beforeState: { safeToAutoHeal: false } }),
      {} as ClusterConnection,
    );

    assert.equal(result.status, "pending");
    assert.equal(terminalEvents.length, 1);
    const event = terminalEvents[0] as { type: string; line: { text: string } };
    assert.equal(event.type, "terminal:line");
    assert.match(event.line.text, /Awaiting human approval/);
  });

  it("heals on successful restart", async () => {
    const lines: string[] = [];
    const hub = new ClusterWebSocketHub();
    hub.broadcastToCluster = (_id, e) => {
      if (e.type === "terminal:line") lines.push(e.line.text);
    };

    let updatedStatus = "pending";
    const db = {
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: "line-1" }],
        }),
      }),
      update: () => ({
        set: (vals: { status: string }) => {
          updatedStatus = vals.status;
          return {
            where: () => ({
              returning: async () => [
                {
                  ...baseRecord(),
                  status: vals.status,
                  durationMs: 100,
                  afterState: { ready: true },
                },
              ],
            }),
          };
        },
      }),
    };

    const connection = {
      deletePod: async () => undefined,
      waitForPodReady: async () => true,
      readPod: async () => ({ status: { phase: "Running" } }),
    } as unknown as ClusterConnection;

    const orchestrator = new HealOrchestrator({
      db: db as never,
      env,
      clusterHub: hub,
    });

    const result = await orchestrator.execute(baseRecord(), connection);

    assert.equal(result.status, "healed");
    assert.equal(updatedStatus, "healed");
    assert.ok(lines.some((l) => l.includes("Deleting pod")));
    assert.ok(lines.some((l) => l.includes("ready")));
  });

  it("escalates fix-secret immediately", async () => {
    const hub = new ClusterWebSocketHub();
    const lines: string[] = [];
    hub.broadcastToCluster = (_id, e) => {
      if (e.type === "terminal:line") lines.push(e.line.text);
    };

    const db = {
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: "line-1" }],
        }),
      }),
      update: () => ({
        set: (vals: { status: string }) => ({
          where: () => ({
            returning: async () => [
              { ...baseRecord(), status: vals.status, durationMs: 5 },
            ],
          }),
        }),
      }),
    };

    const orchestrator = new HealOrchestrator({
      db: db as never,
      env,
      clusterHub: hub,
    });

    const result = await orchestrator.execute(
      baseRecord({
        actionTaken: "fix-secret",
        beforeState: { safeToAutoHeal: true },
      }),
      {} as ClusterConnection,
    );

    assert.equal(result.status, "escalated");
    assert.ok(
      lines.some((l) => l.includes("Cannot auto-fix missing secret")),
    );
  });
});
