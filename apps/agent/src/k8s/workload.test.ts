import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchScaledJobName } from "./workload.js";

function inferScaledJobNameFromJob(jobName: string): string | null {
  const marker = "-scaledjob";
  const idx = jobName.indexOf(marker);
  if (idx === -1) return null;
  const base = jobName.slice(0, idx + marker.length);
  return base.length > marker.length ? base : null;
}

describe("matchScaledJobName", () => {
  it("matches job name prefix to scaledjob", () => {
    const names = [
      "user-badge-batch-processor",
      "user-badge-batch-processor-scaledjob",
    ];
    assert.equal(
      matchScaledJobName(
        "user-badge-batch-processor-scaledjob-qfzcx",
        names,
      ),
      "user-badge-batch-processor-scaledjob",
    );
  });

  it("infers scaledjob name from keda job suffix", () => {
    assert.equal(
      inferScaledJobNameFromJob("user-badge-batch-processor-scaledjob-qfzcx"),
      "user-badge-batch-processor-scaledjob",
    );
  });

  it("prefers longest matching scaledjob name", () => {
    assert.equal(
      matchScaledJobName("api-worker-abc", ["api", "api-worker"]),
      "api-worker",
    );
  });
});
