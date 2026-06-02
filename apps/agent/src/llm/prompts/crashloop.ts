import type { DiagnosePodInput } from "../types.js";

export const ISSUE_TYPE = "CrashLoop" as const;

export function buildCrashLoopPrompt(input: DiagnosePodInput): string {
  return [
    "Issue: CrashLoopBackOff — container repeatedly crashing after start.",
    `Pod: ${input.namespace}/${input.podName}`,
    `Restart count: ${input.restartCount}`,
    "",
    "Focus on: exit codes, crash reasons, liveness/readiness probe failures,",
    "application startup errors, missing dependencies, and config mistakes.",
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
