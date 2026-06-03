import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isJobOwnedPod,
  isWorkerOwnedPod,
  isWorkerOwnedWorkload,
  matchScaledJobName,
  shouldSkipJobPodHeal,
  shouldSkipWorkerPodHeal,
} from "./workload.js";

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

describe("isJobOwnedPod", () => {
  it("detects owner refs, labels, and scaledjob pod names", () => {
    assert.equal(
      isJobOwnedPod({
        metadata: {
          name: "batch-1-abc",
          ownerReferences: [{ kind: "Job", name: "batch-1" }],
        },
      }),
      true,
    );
    assert.equal(
      isJobOwnedPod({
        metadata: {
          name: "batch-1-abc",
          labels: { "batch.kubernetes.io/job-name": "batch-1" },
        },
      }),
      true,
    );
    assert.equal(
      isJobOwnedPod({
        metadata: {
          name: "user-badge-batch-processor-scaledjob-mgt46-fztz2",
        },
      }),
      true,
    );
    assert.equal(
      isJobOwnedPod({
        metadata: {
          name: "nv-sms-skills-ts-outbound-delivery-worker-7dc57db65f-c9j88",
          ownerReferences: [{ kind: "ReplicaSet", name: "worker-7dc57db65f" }],
        },
      }),
      false,
    );
  });
});

describe("shouldSkipJobPodHeal", () => {
  it("skips only when job pods are disabled", () => {
    const scaledJobPod = {
      metadata: {
        name: "user-badge-batch-processor-scaledjob-mgt46-fztz2",
      },
    };

    assert.equal(shouldSkipJobPodHeal(scaledJobPod, null, false), true);
    assert.equal(shouldSkipJobPodHeal(scaledJobPod, null, true), false);
    assert.equal(
      shouldSkipJobPodHeal(
        { metadata: { name: "api-abc" } },
        { kind: "Deployment", name: "api", namespace: "default" },
        false,
      ),
      false,
    );
  });
});

describe("isWorkerOwnedPod", () => {
  it("detects worker deployment pods but not batch jobs", () => {
    assert.equal(
      isWorkerOwnedPod({
        metadata: {
          name: "nv-sms-skills-ts-outbound-delivery-worker-7dc57db65f-c9j88",
        },
      }),
      true,
    );
    assert.equal(
      isWorkerOwnedPod({
        metadata: {
          name: "user-badge-batch-processor-scaledjob-mgt46-fztz2",
        },
      }),
      false,
    );
    assert.equal(
      isWorkerOwnedPod({
        metadata: {
          name: "api-7dc57db65f-c9j88",
          labels: { app: "payments-api" },
        },
      }),
      false,
    );
  });
});

describe("shouldSkipWorkerPodHeal", () => {
  it("skips only when worker deployments are disabled", () => {
    const workerPod = {
      metadata: {
        name: "nv-sms-skills-ts-outbound-delivery-worker-658d7748dd-j44s7",
      },
    };

    assert.equal(shouldSkipWorkerPodHeal(workerPod, null, false), true);
    assert.equal(shouldSkipWorkerPodHeal(workerPod, null, true), false);
    assert.equal(
      shouldSkipWorkerPodHeal(
        workerPod,
        {
          kind: "Deployment",
          name: "nv-sms-skills-ts-outbound-delivery-worker",
          namespace: "nv-sms",
        },
        false,
      ),
      true,
    );
    assert.equal(
      isWorkerOwnedWorkload({
        kind: "Deployment",
        name: "frontend",
        namespace: "default",
      }),
      false,
    );
  });
});
