import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { UPDATE, type V1Pod } from "@kubernetes/client-node";

import { AgentEventBus } from "../events/bus.js";
import type { ClusterConnection } from "../k8s/connection.js";
import { PodReasoner } from "../llm/reasoner.js";
import type { Env } from "../config/env.js";
import { detectIssue } from "./detectIssue.js";
import { PodWatcher } from "./podWatcher.js";

const env: Env = {
  PORT: 3001,
  DATABASE_URL: "postgresql://localhost:5432/kubehealer",
  REDIS_URL: "redis://localhost:6379",
  OLLAMA_URL: "http://localhost:11434",
  JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
};

const crashPod: V1Pod = {
  metadata: { name: "api", namespace: "default" },
  status: {
    containerStatuses: [
      {
        name: "api",
        restartCount: 4,
        state: { waiting: { reason: "CrashLoopBackOff" } },
      },
    ],
  },
};

describe("PodWatcher", () => {
  it("emits issue:detected on MODIFIED crash loop pod", async () => {
    const events: unknown[] = [];
    const eventBus = new AgentEventBus();
    eventBus.on("issue:detected", (p) => events.push(p));

    const connection = {
      listNamespaces: async () => ["default"],
      listNamespacesForWatch: async () => ["default"],
      getPodLogs: async () => "error line",
      getPodEvents: async () => [],
      resolveWorkloadForPod: async () => null,
      startInformer: (
        _ns: string,
        handler: (type: string, pod: V1Pod) => void,
      ) => {
        handler(UPDATE, crashPod);
        return () => {};
      },
    } as unknown as ClusterConnection;

    const db = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: "heal-uuid-1" }],
        }),
      }),
    };

    const reasoner = new PodReasoner({
      env,
      complete: async () => ({
        text: JSON.stringify({
          rootCause: "App crash",
          severity: "high",
          action: "restart",
          reasoning: "Crash loop",
          safeToAutoHeal: true,
        }),
        provider: "ollama",
        latencyMs: 50,
      }),
    });

    const watcher = new PodWatcher({
      db: db as never,
      reasoner,
      eventBus,
      log: {
        info: console.log,
        debug: console.log,
        warn: console.warn,
        error: console.error,
      },
      snapshot: { upsert: () => {}, remove: () => {} } as never,
      isHealEnabled: () => true,
      isHealRuleEnabled: () => true,
      isApprovalRequired: () => false,
      isHealingPaused: () => false,
      getConcurrencyMode: () => "concurrent",
      maxMemoryLimit: "4Gi",
    });

    watcher.start(connection, "cluster-1");
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(events.length, 1);
    const payload = events[0] as { issueType: string; healRecordId: string };
    assert.equal(payload.issueType, detectIssue(crashPod));
    assert.equal(payload.healRecordId, "heal-uuid-1");

    watcher.stop();
  });
});
