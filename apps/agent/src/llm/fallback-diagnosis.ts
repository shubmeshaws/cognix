import type { IssueType } from "../watcher/detectIssue.js";
import type { PodDiagnosis } from "./types.js";

/** Rule-based diagnosis when LLM is unavailable or returns invalid JSON. */
export function fallbackDiagnosis(issueType: IssueType): PodDiagnosis {
  switch (issueType) {
    case "OOM":
      return {
        rootCause: "Container exceeded its memory limit (OOMKilled / exit 137)",
        severity: "high",
        action: "patch-memory",
        reasoning:
          "OOM detected from pod status. Bumping memory limit and rolling the deployment.",
        safeToAutoHeal: true,
      };
    case "CrashLoop":
      return {
        rootCause: "Container is crash-looping",
        severity: "high",
        action: "restart",
        reasoning: "Deleting the pod to trigger a clean restart.",
        safeToAutoHeal: true,
      };
    case "ImagePull":
      return {
        rootCause: "Cannot pull container image",
        severity: "medium",
        action: "escalate",
        reasoning: "Image pull failures usually need registry or secret fixes.",
        safeToAutoHeal: false,
      };
    case "Pending":
      return {
        rootCause: "Pod stuck in Pending",
        severity: "medium",
        action: "escalate",
        reasoning: "Scheduling or resource constraints need investigation.",
        safeToAutoHeal: false,
      };
    case "NodePressure":
      return {
        rootCause: "Node under resource pressure",
        severity: "high",
        action: "escalate",
        reasoning: "Node pressure may require cordon/drain or capacity changes.",
        safeToAutoHeal: false,
      };
    case "MultiVolumeAttachment":
      return {
        rootCause: "Volume attachment or mount failure",
        severity: "high",
        action: "escalate",
        reasoning: "Multi-attach volume conflicts need manual resolution.",
        safeToAutoHeal: false,
      };
    default:
      return {
        rootCause: "Unknown workload issue",
        severity: "medium",
        action: "escalate",
        reasoning: "Escalating for human review.",
        safeToAutoHeal: false,
      };
  }
}
