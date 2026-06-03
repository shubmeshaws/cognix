/** API-aligned types for agent REST + WebSocket payloads */

export interface PodSummary {
  name: string;
  namespace: string;
  phase: string;
  restartCount: number;
  ready: boolean;
  issueType: string | null;
  hasActiveHeal: boolean;
  /** Pod is owned by a Kubernetes Job, CronJob, or ScaledJob. */
  jobOwned?: boolean;
  /** Pod belongs to a worker Deployment (name or labels include “worker”). */
  workerOwned?: boolean;
}

export type HealStatus =
  | "pending"
  | "healed"
  | "escalated"
  | "failed"
  | "skipped";

export interface HealRecord {
  id: string;
  clusterId: string;
  podName: string;
  namespace: string;
  issueType: string;
  severity: string;
  actionTaken: string;
  status: HealStatus;
  durationMs: number;
  approvedBy: string | null;
  createdAt: string;
  deploymentName?: string | null;
  rolloutComplete?: boolean;
  memoryPatched?: boolean;
  needsApproval?: boolean;
}

export interface HealsPage {
  page: number;
  pageSize: number;
  total: number;
  items: HealRecord[];
}

export interface AlertEvent {
  id: string;
  clusterId: string;
  podName: string;
  namespace: string;
  message: string;
  severity: string;
  notifiedSlack: boolean;
  notifiedPagerduty: boolean;
  createdAt: string;
}

export interface OomMemoryApprovalDetail {
  containerName: string;
  memoryLimit: string;
  memoryRequest?: string;
  memoryUsed?: string;
  recommendedLimit: string;
}

export interface ApprovalRequest {
  healId: string;
  podName: string;
  namespace: string;
  issue?: string;
  action: string;
  reasoning: string;
  severity: string;
  createdAt: string;
  memory?: OomMemoryApprovalDetail;
  /** Unix ms; hidden from banners until elapsed */
  snoozedUntil?: number;
}

export interface PendingApprovalsResponse {
  items: ApprovalRequest[];
}

export type ApprovalAuditAction =
  | "approved"
  | "rejected"
  | "snoozed"
  | "auto-rejected";

export interface ApprovalAuditEntry {
  healId: string;
  podName: string;
  namespace: string;
  action: ApprovalAuditAction;
  actorEmail: string;
  actorId?: string;
  timestamp: string;
  detail?: string;
}

export interface TerminalLine {
  id: string;
  healId: string;
  clusterId: string;
  sequence: number;
  level: string;
  text: string;
  timestamp: string;
}

export interface HealTerminalLine {
  id: string;
  sequence: number;
  level: string;
  text: string;
  ts: string;
}

export interface HealTerminalResponse {
  healId: string;
  lines: HealTerminalLine[];
}

export interface LiveTerminalLine {
  id: string;
  healId: string;
  clusterId: string;
  sequence: number;
  level: string;
  text: string;
  ts: string;
}

export interface LiveTerminalResponse {
  lines: LiveTerminalLine[];
}

export type ClusterWsEvent =
  | { type: "pod:update"; pod: PodSummary }
  | {
      type: "heal:start";
      healId: string;
      podName: string;
      namespace: string;
      issue: string;
      action?: string;
      severity?: string;
    }
  | {
      type: "heal:complete";
      healId: string;
      status: string;
      durationMs: number;
      podName?: string;
      namespace?: string;
      issue?: string;
      action?: string;
      severity?: string;
      deploymentName?: string;
      rolloutComplete?: boolean;
    }
  | {
      type: "terminal:line";
      healId: string;
      line: { id: string; sequence: number; level: string; text: string; ts: string };
    }
  | { type: "alert:new"; alert: AlertEvent }
  | {
      type: "approval:required";
      healId: string;
      podName: string;
      namespace: string;
      issue?: string;
      action: string;
      reasoning: string;
      severity: string;
      memory?: OomMemoryApprovalDetail;
    }
  | { type: "connected"; clusterId: string }
  | { type: "pong" };

export interface LocalKubeconfigResponse {
  path: string;
  kubeconfig: string;
  currentContext: string | null;
  contexts: string[];
}

export type HealRuleId =
  | "CrashLoop"
  | "OOM"
  | "ImagePull"
  | "Pending"
  | "NodePressure"
  | "MultiVolumeAttachment";

export type HealRuleCategory = "pods" | "nodes" | "pvc" | "addons";

export interface HealRuleDefinition {
  id: HealRuleId;
  label: string;
  description: string;
  category: HealRuleCategory;
}

export type HealRuleMode = "auto" | "approval";

export interface HealRulesResponse {
  clusterId: string;
  catalog: HealRuleDefinition[];
  enabled: HealRuleId[];
  rules: Record<HealRuleId, boolean>;
  /** Per enabled rule: auto-heal vs require approval */
  modes: Record<HealRuleId, HealRuleMode>;
  approvalRules: HealRuleId[];
  concurrencyMode: "concurrent" | "sequential";
  /** When true, pod rules also apply to Job / CronJob / ScaledJob pods. */
  healJobPods: boolean;
  /** When true, pod rules also apply to worker Deployment pods. */
  healWorkerPods: boolean;
}

export interface ConnectClusterResult {
  clusterId: string;
  serverUrl: string;
  version: string;
  nodeCount: number | null;
  namespaces: string[];
}

export interface ClusterRegistration {
  token: string;
  /** Same value as token — use as KUBEHEALER_CLUSTER_TOKEN in the install manifest */
  clusterToken: string;
  expiresAt: string;
}

export type RegistrationStatus =
  | { status: "pending" }
  | { status: "connected"; clusterId: string; result: ConnectClusterResult };

export interface ClusterListItem {
  id: string;
  name: string;
  serverUrl: string;
  contextName: string;
  lastConnectedAt: string | null;
  health: {
    ok: boolean;
    version: string;
    checkedAt: string | null;
  };
}

export interface AgentStatus {
  uptimeSec: number;
  /** When true, watchers run but auto-heal actions are not started */
  healingPaused?: boolean;
  /** When true, dashboard shows per-pod Heal buttons */
  manualHealEnabled?: boolean;
  watcher: {
    activeClusters: number;
    wsClients: number;
    connectedClusters: number;
  };
  llm: {
    chain: LlmProviderChainApi;
    activeChain: LlmProviderIdApi[];
    ollama: { url: string; ok: boolean; model: string };
    openai: { configured: boolean; model: string };
    anthropic: { configured: boolean; model: string };
    puter: { configured: boolean; model: string };
  };
}

export type LlmProviderIdApi = "ollama" | "openai" | "anthropic" | "puter";

export type LlmProviderChainApi = [
  LlmProviderIdApi | null,
  LlmProviderIdApi | null,
  LlmProviderIdApi | null,
];

export interface LlmConfigResponse {
  llmChain: LlmProviderChainApi;
  ollamaUrl: string;
  ollamaModel: string;
  openaiModel: string;
  anthropicModel: string;
  puterModel: string;
  openaiApiKeySet: boolean;
  openaiApiKeyPreview: string | null;
  anthropicApiKeySet: boolean;
  anthropicApiKeyPreview: string | null;
  puterAuthTokenSet: boolean;
  puterAuthTokenPreview: string | null;
  puterAppOrigin: string;
  envOllamaUrl: string;
  envOpenaiConfigured: boolean;
  envAnthropicConfigured: boolean;
  envPuterConfigured: boolean;
  activeChain: LlmProviderIdApi[];
}

export interface LlmConfigPatch {
  llmChain?: LlmProviderChainApi;
  ollamaUrl?: string;
  ollamaModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  puterAuthToken?: string;
  puterModel?: string;
  /** Browser origin for Puter app-token exchange (e.g. http://localhost:3000). */
  puterAppOrigin?: string;
}

export interface LlmConnectionTestRequest {
  provider: LlmProviderIdApi;
  ollamaUrl?: string;
  ollamaModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  puterAuthToken?: string;
  puterModel?: string;
  puterAppOrigin?: string;
}

export interface LlmConnectionTestResponse {
  ok: boolean;
  message: string;
}

export interface TeamsConfigResponse {
  teamsWebhookUrlSet: boolean;
  teamsWebhookUrlPreview: string | null;
}

export interface TeamsConfigPatch {
  teamsWebhookUrl?: string;
}

export interface TeamsConnectionTestRequest {
  teamsWebhookUrl?: string;
}

export interface TeamsConnectionTestResponse {
  ok: boolean;
  message: string;
}

export interface SetupHealthCheck {
  id: string;
  ok: boolean;
  detail: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface SetupHealthResponse {
  checkedAt: string;
  checks: SetupHealthCheck[];
}

export interface NodeCondition {
  type: string;
  status: string;
  message: string;
  reason: string;
}

export interface NodeAddress {
  type: string;
  address: string;
}

export interface NodeSummary {
  name: string;
  status: "Ready" | "NotReady" | "Unknown";
  color: "red" | "green" | "blue";
  roles: string[];
  conditions: NodeCondition[];
  cpuCapacity: string;
  cpuAllocatable: string;
  memoryCapacity: string;
  memoryAllocatable: string;
  kubeletVersion: string;
  osImage: string;
  architecture: string;
  operatingSystem: string;
  addresses: NodeAddress[];
  createdAt?: string;
}

export type AppUserRole = "admin" | "user";

export interface AppUser {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: AppUserRole;
  mustChangePassword: boolean;
  active: boolean;
  hasPassword: boolean;
  oauthProvider: string | null;
  createdAt: string;
}

export interface UsersListResponse {
  users: AppUser[];
}

export interface CreateUserResponse {
  user: AppUser;
  temporaryPassword: string;
}

export interface ResetPasswordResponse {
  temporaryPassword: string;
}

