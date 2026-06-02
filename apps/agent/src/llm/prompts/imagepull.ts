import type { DiagnosePodInput } from "../types.js";

export const ISSUE_TYPE = "ImagePull" as const;

export function buildImagePullPrompt(input: DiagnosePodInput): string {
  return [
    "Issue: ImagePullBackOff / ErrImagePull — cannot pull container image.",
    `Pod: ${input.namespace}/${input.podName}`,
    `Restart count: ${input.restartCount}`,
    "",
    "Focus on: image name/tag typos, registry auth (imagePullSecrets),",
    "private registry connectivity, and fix-secret for missing credentials.",
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
