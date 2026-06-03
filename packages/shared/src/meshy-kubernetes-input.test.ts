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

  it("fixes nudes to nodes in cluster context", () => {
    const r = normalizeKubernetesInput("nudes in my cluster and note puls to");
    assert.match(r.normalized, /nodes in my cluster/i);
    assert.doesNotMatch(r.normalized, /nudes/i);
    assert.match(r.normalized, /nodepools too/i);
    assert.doesNotMatch(r.normalized, /note puls/i);
  });

  it("fixes note puls to nodepools", () => {
    const r = normalizeKubernetesInput("how many note puls in my cluster");
    assert.match(r.normalized, /nodepools/i);
  });

  it("fixes not pools to nodepools", () => {
    const r = normalizeKubernetesInput("list not pools in my cluster");
    assert.match(r.normalized, /list nodepools/i);
  });

  it("fixes police to please", () => {
    const r = normalizeKubernetesInput("police list the nodes in my cluster");
    assert.match(r.normalized, /please list the nodes/i);
    assert.doesNotMatch(r.normalized, /police/i);
  });

  it("fixes don't listen to don't list them", () => {
    const r = normalizeKubernetesInput("don't listen");
    assert.match(r.normalized, /don't list them/i);
  });
});
