import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { V1Pod } from "@kubernetes/client-node";

import { detectIssue, getPodRestartCount } from "./detectIssue.js";

function pod(partial: Partial<V1Pod>): V1Pod {
  return partial as V1Pod;
}

describe("detectIssue", () => {
  it("detects CrashLoopBackOff", () => {
    const result = detectIssue(
      pod({
        status: {
          containerStatuses: [
            {
              name: "app",
              restartCount: 3,
              state: { waiting: { reason: "CrashLoopBackOff" } },
            },
          ],
        },
      }),
    );
    assert.equal(result, "CrashLoop");
  });

  it("detects OOM before CrashLoop when lastState was OOMKilled", () => {
    const result = detectIssue(
      pod({
        status: {
          containerStatuses: [
            {
              name: "app",
              restartCount: 5,
              state: { waiting: { reason: "CrashLoopBackOff" } },
              lastState: {
                terminated: { exitCode: 137, reason: "OOMKilled" },
              },
            },
          ],
        },
      }),
    );
    assert.equal(result, "OOM");
  });

  it("detects OOMKilled via exit code 137", () => {
    const result = detectIssue(
      pod({
        status: {
          containerStatuses: [
            {
              name: "app",
              restartCount: 2,
              lastState: { terminated: { exitCode: 137 } },
            },
          ],
        },
      }),
    );
    assert.equal(result, "OOM");
  });

  it("detects ImagePullBackOff", () => {
    const result = detectIssue(
      pod({
        status: {
          containerStatuses: [
            {
              name: "app",
              state: { waiting: { reason: "ImagePullBackOff" } },
            },
          ],
        },
      }),
    );
    assert.equal(result, "ImagePull");
  });

  it("detects Pending older than 5 minutes", () => {
    const old = new Date(Date.now() - 400_000).toISOString();
    const result = detectIssue(
      pod({
        metadata: { creationTimestamp: old },
        status: { phase: "Pending" },
      }),
    );
    assert.equal(result, "Pending");
  });

  it("returns null for healthy running pod", () => {
    const result = detectIssue(
      pod({
        status: {
          phase: "Running",
          containerStatuses: [{ name: "app", restartCount: 0, ready: true }],
        },
      }),
    );
    assert.equal(result, null);
  });
});

describe("getPodRestartCount", () => {
  it("returns max restart count across containers", () => {
    const count = getPodRestartCount(
      pod({
        status: {
          containerStatuses: [
            { restartCount: 2 },
            { restartCount: 7 },
          ],
        },
      }),
    );
    assert.equal(count, 7);
  });
});
