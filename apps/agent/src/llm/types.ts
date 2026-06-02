import { z } from "zod";

export const diagnosisSchema = z.object({
  rootCause: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  action: z.enum([
    "restart",
    "patch-memory",
    "patch-cpu",
    "rollback",
    "fix-secret",
    "scale",
    "escalate",
  ]),
  reasoning: z.string().min(1),
  safeToAutoHeal: z.boolean(),
  patchSpec: z.record(z.unknown()).optional(),
});

export type PodDiagnosis = z.infer<typeof diagnosisSchema>;

export interface DiagnosePodInput {
  podName: string;
  namespace: string;
  issueType: string;
  restartCount: number;
  logs: string;
  events: string[];
}

export type IssueTypeKey =
  | "CrashLoop"
  | "OOM"
  | "Pending"
  | "ImagePull"
  | "NodePressure"
  | "MultiVolumeAttachment";
