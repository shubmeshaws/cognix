import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildUserPrompt } from "./prompts/index.js";
import { buildOomPrompt } from "./prompts/oom.js";
import { PodReasoner } from "./reasoner.js";
import type { Env } from "../config/env.js";

const env: Env = {
  PORT: 3001,
  DATABASE_URL: "postgresql://localhost:5432/kubehealer",
  OLLAMA_URL: "http://localhost:11434",
  JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
};

const sampleInput = {
  podName: "api-7f8b9c",
  namespace: "production",
  issueType: "OOM",
  restartCount: 5,
  logs: "OOMKilled\nmemory limit exceeded",
  events: ["Warning OOMKilling: Memory cgroup out of memory"],
};

const sampleDiagnosis = {
  rootCause: "Memory limit too low for workload",
  severity: "high",
  action: "patch-memory",
  reasoning: "OOMKilled events confirm memory pressure",
  safeToAutoHeal: true,
  patchSpec: {
    spec: {
      containers: [{ name: "api", resources: { limits: { memory: "512Mi" } } }],
    },
  },
};

describe("prompt templates", () => {
  it("selects OOM template by issue type", () => {
    const prompt = buildUserPrompt(sampleInput);
    assert.match(prompt, /OOMKilled/);
    assert.match(prompt, /production\/api-7f8b9c/);
  });

  it("buildOomPrompt includes memory focus", () => {
    const prompt = buildOomPrompt(sampleInput);
    assert.match(prompt, /memory limit/i);
  });
});

describe("PodReasoner", () => {
  it("returns parsed diagnosis from LLM response", async () => {
    const reasoner = new PodReasoner({
      env,
      complete: async () => ({
        text: JSON.stringify(sampleDiagnosis),
        provider: "ollama",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        latencyMs: 1200,
      }),
    });

    const result = await reasoner.diagnosePod(sampleInput);
    assert.equal(result.action, "patch-memory");
    assert.equal(result.safeToAutoHeal, true);
    assert.ok(result.patchSpec);
  });

  it("retries once when first response is invalid JSON", async () => {
    let calls = 0;
    const reasoner = new PodReasoner({
      env,
      complete: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            text: "not json",
            provider: "ollama",
            latencyMs: 100,
          };
        }
        return {
          text: JSON.stringify(sampleDiagnosis),
          provider: "openai",
          promptTokens: 80,
          completionTokens: 40,
          totalTokens: 120,
          latencyMs: 900,
        };
      },
    });

    const result = await reasoner.diagnosePod(sampleInput);
    assert.equal(calls, 2);
    assert.equal(result.severity, "high");
  });
});
