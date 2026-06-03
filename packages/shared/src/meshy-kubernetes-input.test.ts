import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeKubernetesInput } from "./meshy-kubernetes-input.js";

describe("normalizeKubernetesInput node speech homophones", () => {
  it("fixes node pulse to nodes", () => {
    const r = normalizeKubernetesInput(
      "please tell me the number of node pulse in my cluster",
    );
    assert.match(r.normalized, /number of nodes/i);
    assert.doesNotMatch(r.normalized, /pulse/i);
  });

  it("fixes north poles to nodes", () => {
    const r = normalizeKubernetesInput(
      "Chandan number of north poles in my cluster",
    );
    assert.match(r.normalized, /number of nodes/i);
    assert.doesNotMatch(r.normalized, /north pole/i);
  });

  it("fixes list down the node pulse", () => {
    const r = normalizeKubernetesInput("list down the node pulse in my cluster");
    assert.match(r.normalized, /list nodes/i);
  });

  it("fixes node poll to nodes", () => {
    const r = normalizeKubernetesInput("how many node polls in my cluster");
    assert.match(r.normalized, /how many nodes/i);
  });
});
