import type { DiagnosePodInput } from "../types.js";

export const ISSUE_TYPE = "Pending" as const;

export function buildPendingPrompt(input: DiagnosePodInput): string {
  return [
    "Issue: Pod Pending — not scheduled or stuck initializing.",
    `Pod: ${input.namespace}/${input.podName}`,
    `Restart count: ${input.restartCount}`,
    "",
    "Focus on: scheduling failures, insufficient cluster resources,",
    "node selectors/affinity, PVC binding, image pull init delays, and quotas.",
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
