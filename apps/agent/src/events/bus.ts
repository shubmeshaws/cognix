import { EventEmitter } from "node:events";

import type { V1Pod } from "@kubernetes/client-node";

import type { PodDiagnosis } from "../llm/types.js";
import type { IssueType } from "../watcher/detectIssue.js";

export interface IssueDetectedPayload {
  clusterId: string;
  healRecordId: string;
  podName: string;
  namespace: string;
  issueType: IssueType;
  diagnosis: PodDiagnosis;
  pod: V1Pod;
  logs: string;
  events: string[];
  /** Started from dashboard Heal button — runs even when auto-heal is paused */
  manual?: boolean;
}

export class AgentEventBus extends EventEmitter {
  emitIssueDetected(payload: IssueDetectedPayload): void {
    this.emit("issue:detected", payload);
  }

  onIssueDetected(
    handler: (payload: IssueDetectedPayload) => void,
  ): () => void {
    this.on("issue:detected", handler);
    return () => this.off("issue:detected", handler);
  }
}
