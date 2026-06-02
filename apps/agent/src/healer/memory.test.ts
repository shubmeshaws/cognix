import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bumpMemoryLimit, parseMemoryToBytes } from "./memory.js";

describe("memory", () => {
  it("parses Mi and Gi quantities", () => {
    assert.equal(parseMemoryToBytes("512Mi"), 512 * 1024 * 1024);
    assert.equal(parseMemoryToBytes("2Gi"), 2 * 1024 * 1024 * 1024);
  });

  it("bumps memory by 1.5x capped at max", () => {
    assert.equal(bumpMemoryLimit("512Mi", "4Gi"), "768Mi");
    assert.equal(bumpMemoryLimit("3Gi", "4Gi"), "4Gi");
  });
});
