import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildHealTeamsCard,
  formatHealFixDescription,
  formatHealTrigger,
} from "./teams-notify.js";
import type { HealRecord } from "./types.js";

function baseRecord(patch: Partial<HealRecord> = {}): HealRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    clusterId: "cluster-1",
    podName: "api-abc123",
    namespace: "default",
    issueType: "OOM",
    severity: "high",
    llmReasoning: "OOM detected",
    actionTaken: "patch-memory",
    status: "healed",
    durationMs: 12_000,
    beforeState: { safeToAutoHeal: true, deploymentName: "api" },
    afterState: {
      deployment: "api",
      memoryLimitBefore: "256Mi",
      memoryLimit: "512Mi",
      rolloutComplete: true,
    },
    approvedBy: null,
    createdAt: new Date("2026-05-21T10:00:00.000Z"),
    ...patch,
  };
}

describe("teams notify formatting", () => {
  it("describes OOM memory patch", () => {
    const text = formatHealFixDescription(baseRecord());
    assert.match(text, /256Mi/);
    assert.match(text, /512Mi/);
    assert.match(text, /Rollout completed/);
  });

  it("labels manual approval with approver name", () => {
    const trigger = formatHealTrigger(
      baseRecord({ approvedBy: "user-1" }),
      "Jane Doe",
    );
    assert.equal(trigger, "Manual — Jane Doe");
  });

  it("labels auto-heal", () => {
    assert.equal(formatHealTrigger(baseRecord()), "Auto-heal");
  });

  it("builds heal card with cluster and deployment", () => {
    const card = buildHealTeamsCard(baseRecord(), "prod-cluster", null);
    assert.equal(card.title, "Pod healed successfully");
    assert.ok(card.facts.some((f) => f.title === "Cluster" && f.value === "prod-cluster"));
    assert.ok(card.facts.some((f) => f.title === "Deployment" && f.value === "api"));
  });
});
