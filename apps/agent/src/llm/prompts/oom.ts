import type { DiagnosePodInput } from "../types.js";

export const ISSUE_TYPE = "OOM" as const;

export function buildOomPrompt(input: DiagnosePodInput): string {
  return [
    "Issue: OOMKilled — container terminated due to memory limit.",
    `Pod: ${input.namespace}/${input.podName}`,
    `Restart count: ${input.restartCount}`,
    "",
    "Focus on: memory requests/limits, heap usage, memory leaks,",
    "sidecar overhead, and whether patch-memory with higher limits is appropriate.",
    "",
    "Recent logs (last 80 lines):",
    input.logs || "(no logs available)",
    "",
    "Recent events:",
    formatEvents(input.events),
  ].join("\n");
}

function formatEvents(events: string[]): string {
  if (events.length === 0) return "(no events)";
  return events.slice(-20).join("\n");
}
