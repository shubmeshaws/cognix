import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Env } from "./env.js";
import {
  clearLlmRuntime,
  getConfiguredChain,
  setLlmRuntime,
} from "./llm-runtime.js";

const env: Env = {
  PORT: 3001,
  DATABASE_URL: "postgresql://localhost:5432/kubehealer",
  OLLAMA_URL: "http://localhost:11434",
  JWT_SECRET: "test-jwt-secret-at-least-32-characters-long",
};

describe("getConfiguredChain", () => {
  it("auto-detects Ollama first when no explicit chain was applied", () => {
    clearLlmRuntime();
    assert.deepEqual(getConfiguredChain(env), ["ollama"]);
  });

  it("uses explicit OpenAI-only chain and does not fall back to Ollama", () => {
    clearLlmRuntime();
    setLlmRuntime({
      llmChain: ["openai", null, null],
      openaiApiKey: "sk-test-key",
    });
    assert.deepEqual(getConfiguredChain(env), ["openai"]);
  });

  it("honors primary then fallbacks in explicit chain order", () => {
    clearLlmRuntime();
    setLlmRuntime({
      llmChain: ["openai", "ollama", null],
      openaiApiKey: "sk-test-key",
    });
    assert.deepEqual(getConfiguredChain(env), ["openai", "ollama"]);
  });

  it("returns empty when explicit chain providers are not configured", () => {
    clearLlmRuntime();
    setLlmRuntime({ llmChain: ["openai", null, null] });
    assert.deepEqual(getConfiguredChain(env), []);
  });
});
