import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveOllamaModel, ollamaModelMatches } from "../llm/ollama-models.js";

describe("ollama model resolution", () => {
  const models = [{ name: "qwen3:8b" }, { name: "glm-5:cloud" }];

  it("matches exact and tag variants", () => {
    assert.equal(ollamaModelMatches(models, "qwen3:8b"), true);
    assert.equal(ollamaModelMatches(models, "qwen3"), true);
    assert.equal(ollamaModelMatches(models, "llama3.1:8b"), false);
  });

  it("auto-selects first model when preferred missing", () => {
    const r = resolveOllamaModel(models, "llama3.1:8b");
    assert.equal(r.model, "qwen3:8b");
    assert.equal(r.autoSelected, true);
  });

  it("keeps preferred when present", () => {
    const r = resolveOllamaModel(models, "qwen3:8b");
    assert.equal(r.model, "qwen3:8b");
    assert.equal(r.autoSelected, false);
  });
});
