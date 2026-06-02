import type { DiagnosePodInput } from "../types.js";

export const ISSUE_TYPE = "NodePressure" as const;

export function buildNodePressurePrompt(input: DiagnosePodInput): string {
  return [
    "Issue: NodePressure - node under disk/memory/PID pressure affecting the pod.",
    `Pod: ${input.namespace}/${input.podName}`,
    `Restart count: ${input.restartCount}`,
    "",
    "Focus on: node conditions (DiskPressure, MemoryPressure, PIDPressure),",
    "evictions, taints, and whether scale or escalate is needed vs restart.",
    "",
    "Recent logs (last 80 lines):",
    input.logs || "(no logs available)",
    "",
    "Recent events:",
    formatEvents(input.events),
  ].join("\n");
}

function formatEvents(events: string[]): string {
  if (events.length === 0) {
    return "(no events)";
  }
  return events.slice(-20).join("\n");
}
