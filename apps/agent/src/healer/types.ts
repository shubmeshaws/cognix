export type HealAction =
  | "restart"
  | "patch-memory"
  | "patch-cpu"
  | "rollback"
  | "fix-secret"
  | "scale"
  | "escalate";

export type HealStatus =
  | "pending"
  | "healed"
  | "escalated"
  | "failed"
  | "skipped";

export type HealSeverity = "low" | "medium" | "high" | "critical";

export type HealIssueType =
  | "CrashLoop"
  | "OOM"
  | "Pending"
  | "ImagePull"
  | "NodePressure"
  | "MultiVolumeAttachment";

export type TerminalLevel =
  | "info"
  | "warn"
  | "err"
  | "ok"
  | "cmd"
  | "heal";

export interface HealRecord {
  id: string;
  clusterId: string;
  podName: string;
  namespace: string;
  issueType: HealIssueType;
  severity: HealSeverity;
  llmReasoning: string;
  actionTaken: HealAction | string;
  status: HealStatus;
  durationMs: number;
  beforeState: HealBeforeState;
  afterState: Record<string, unknown>;
  approvedBy: string | null;
  createdAt?: Date;
}

export interface HealBeforeState {
  phase?: string;
  containerStatuses?: unknown;
  conditions?: unknown;
  labels?: Record<string, string>;
  safeToAutoHeal?: boolean;
  patchSpec?: Record<string, unknown>;
  deploymentName?: string;
  workloadKind?: string;
  workloadName?: string;
  approvalRequired?: boolean;
  memoryApproval?: {
    containerName: string;
    memoryLimit: string;
    memoryRequest?: string;
    memoryUsed?: string;
    recommendedLimit: string;
  };
  [key: string]: unknown;
}

export interface TerminalLineEvent {
  type: "terminal:line";
  clusterId: string;
  healRecordId: string;
  sequence: number;
  level: TerminalLevel;
  text: string;
  ts: string;
}
