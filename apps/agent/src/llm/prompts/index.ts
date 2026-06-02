import type { DiagnosePodInput, IssueTypeKey } from "../types.js";
import { buildCrashLoopPrompt } from "./crashloop.js";
import { buildImagePullPrompt } from "./imagepull.js";
import { buildNodePressurePrompt } from "./node-pressure.js";
import { buildOomPrompt } from "./oom.js";
import { buildPendingPrompt } from "./pending.js";

type PromptBuilder = (input: DiagnosePodInput) => string;

function buildVolumeAttachPrompt(input: DiagnosePodInput): string {
  return [
    "Issue: Multi-Attach / FailedMount — volume cannot attach to this node.",
    `Pod: ${input.namespace}/${input.podName}`,
    `Restarts: ${input.restartCount}`,
    "",
    "Recent logs:",
    input.logs,
    "",
    "Events:",
    input.events.join("\n"),
  ].join("\n");
}

const templates: Record<IssueTypeKey, PromptBuilder> = {
  CrashLoop: buildCrashLoopPrompt,
  OOM: buildOomPrompt,
  Pending: buildPendingPrompt,
  ImagePull: buildImagePullPrompt,
  NodePressure: buildNodePressurePrompt,
  MultiVolumeAttachment: buildVolumeAttachPrompt,
};

const ALIASES: Record<string, IssueTypeKey> = {
  crashloop: "CrashLoop",
  crashloopbackoff: "CrashLoop",
  oom: "OOM",
  oomkilled: "OOM",
  pending: "Pending",
  imagepull: "ImagePull",
  imagepullbackoff: "ImagePull",
  errimagepull: "ImagePull",
  nodepressure: "NodePressure",
  multivolumeattachment: "MultiVolumeAttachment",
  failedmount: "MultiVolumeAttachment",
};

export function normalizeIssueType(issueType: string): IssueTypeKey {
  const key = issueType.replace(/[\s_-]/g, "").toLowerCase();
  return ALIASES[key] ?? (issueType as IssueTypeKey);
}

export function buildUserPrompt(input: DiagnosePodInput): string {
  const issueKey = normalizeIssueType(input.issueType);
  const builder = templates[issueKey] ?? buildCrashLoopPrompt;
  return builder({ ...input, issueType: issueKey });
}
