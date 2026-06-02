import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDiagnosis } from "./parse.js";

const valid = {
  rootCause: "Container exits with code 1 on startup",
  severity: "high",
  action: "restart",
  reasoning: "Probe fails after crash loop",
  safeToAutoHeal: true,
};

describe("parseDiagnosis", () => {
  it("parses raw JSON", () => {
    const result = parseDiagnosis(JSON.stringify(valid));
    assert.equal(result.rootCause, valid.rootCause);
    assert.equal(result.severity, "high");
  });

  it("parses JSON inside markdown fences", () => {
    const wrapped = "```json\n" + JSON.stringify(valid) + "\n```";
    const result = parseDiagnosis(wrapped);
    assert.equal(result.action, "restart");
  });
});
