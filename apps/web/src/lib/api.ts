import type {
  AgentStatus,
  AlertEvent,
  ClusterListItem,
  ClusterRegistration,
  ConnectClusterResult,
  HealRulesResponse,
  LlmConfigPatch,
  LlmConfigResponse,
  LlmConnectionTestRequest,
  LlmConnectionTestResponse,
  SetupHealthResponse,
  TeamsConfigPatch,
  TeamsConfigResponse,
  TeamsConnectionTestRequest,
  TeamsConnectionTestResponse,
  LocalKubeconfigResponse,
  HealTerminalResponse,
  LiveTerminalResponse,
  HealsPage,
  PendingApprovalsResponse,
  PodSummary,
  RegistrationStatus,
  NodeSummary,
  AppUser,
  AppUserRole,
  UsersListResponse,
  CreateUserResponse,
  ResetPasswordResponse,
  SsoConfigPatch,
  SsoConfigResponse,
  SsoProviderId,
} from "@/types/api";

import { getAgentInternalBaseUrl } from "@/lib/agent-internal-url";

/** Browser: same-origin /api/agent proxy. Server: direct agent URL. */
function resolveApiUrl(path: string): string {
  if (typeof window !== "undefined") {
    if (path.startsWith("/api/")) {
      return `/api/agent/${path.slice("/api/".length)}`;
    }
    return path;
  }
  const base = (process.env.NEXT_PUBLIC_API_URL ?? getAgentInternalBaseUrl()).replace(
    /\/$/,
    "",
  );
  return `${base}${path}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const hasBody =
    init?.body !== undefined &&
    init.body !== null &&
    init.body !== "";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(resolveApiUrl(path), {
    ...init,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(body || res.statusText, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export function getWsBaseUrl(): string {
  const httpBase =
    typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")
      : (process.env.NEXT_PUBLIC_API_URL ?? getAgentInternalBaseUrl());
  return httpBase.replace(/^http/, "ws");
}

export async function fetchPods(
  clusterId: string,
  token: string,
): Promise<PodSummary[]> {
  const data = await apiFetch<{ pods: PodSummary[] }>(
    `/api/pods?clusterId=${clusterId}`,
    token,
  );
  return data.pods;
}

export async function fetchNodes(
  clusterId: string,
  token: string,
): Promise<NodeSummary[]> {
  const data = await apiFetch<{ nodes: NodeSummary[] }>(
    `/api/nodes?clusterId=${clusterId}`,
    token,
  );
  return data.nodes;
}

export async function fetchPodLogs(
  clusterId: string,
  namespace: string,
  podName: string,
  token: string,
): Promise<string> {
  const data = await apiFetch<{ logs: string }>(
    `/api/pods/${podName}/logs?clusterId=${clusterId}&ns=${namespace}`,
    token,
  );
  return data.logs;
}

export async function fetchHeals(
  clusterId: string,
  token: string,
  page = 1,
  pageSize = 20,
): Promise<HealsPage> {
  return apiFetch<HealsPage>(
    `/api/heals?clusterId=${clusterId}&page=${page}&pageSize=${pageSize}`,
    token,
  );
}

export async function fetchPendingApprovals(
  clusterId: string,
  token: string,
): Promise<PendingApprovalsResponse> {
  return apiFetch<PendingApprovalsResponse>(
    `/api/heals/pending-approvals?clusterId=${clusterId}`,
    token,
  );
}

export async function fetchAlerts(
  clusterId: string,
  token: string,
): Promise<AlertEvent[]> {
  const data = await apiFetch<{ alerts: AlertEvent[] }>(
    `/api/alerts?clusterId=${clusterId}`,
    token,
  );
  return data.alerts;
}

export async function fetchAgentStatus(token: string): Promise<AgentStatus> {
  return apiFetch<AgentStatus>("/api/agent/status", token);
}

export async function fetchSetupHealth(token: string): Promise<SetupHealthResponse> {
  return apiFetch<SetupHealthResponse>("/api/agent/setup-health", token);
}

export async function setAgentHealingPaused(
  token: string,
  paused: boolean,
): Promise<{ healingPaused: boolean }> {
  return apiFetch<{ healingPaused: boolean }>("/api/agent/healing", token, {
    method: "PATCH",
    body: JSON.stringify({ paused }),
  });
}

export async function setAgentManualHealEnabled(
  token: string,
  enabled: boolean,
): Promise<{ manualHealEnabled: boolean }> {
  return apiFetch<{ manualHealEnabled: boolean }>(
    "/api/agent/manual-heal",
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    },
  );
}

export async function triggerManualPodHeal(
  token: string,
  clusterId: string,
  namespace: string,
  podName: string,
): Promise<{ ok: true; podName: string; namespace: string }> {
  return apiFetch<{ ok: true; podName: string; namespace: string }>(
    "/api/pods/heal",
    token,
    {
      method: "POST",
      body: JSON.stringify({ clusterId, namespace, podName }),
    },
  );
}

export async function fetchLlmConfig(token: string): Promise<LlmConfigResponse> {
  return apiFetch<LlmConfigResponse>("/api/agent/llm-config", token);
}

export async function updateLlmConfig(
  token: string,
  body: LlmConfigPatch,
): Promise<LlmConfigResponse> {
  return apiFetch<LlmConfigResponse>("/api/agent/llm-config", token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function testLlmConnection(
  token: string,
  body: LlmConnectionTestRequest,
): Promise<LlmConnectionTestResponse> {
  return apiFetch<LlmConnectionTestResponse>(
    "/api/agent/llm-config/test",
    token,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function fetchTeamsConfig(
  token: string,
): Promise<TeamsConfigResponse> {
  return apiFetch<TeamsConfigResponse>("/api/agent/teams-config", token);
}

export async function updateTeamsConfig(
  token: string,
  body: TeamsConfigPatch,
): Promise<TeamsConfigResponse> {
  return apiFetch<TeamsConfigResponse>("/api/agent/teams-config", token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function testTeamsConnection(
  token: string,
  body: TeamsConnectionTestRequest = {},
): Promise<TeamsConnectionTestResponse> {
  return apiFetch<TeamsConnectionTestResponse>(
    "/api/agent/teams-config/test",
    token,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function fetchClusters(token: string): Promise<ClusterListItem[]> {
  return apiFetch<ClusterListItem[]>("/api/clusters/list", token);
}

export async function deleteCluster(
  token: string,
  clusterId: string,
): Promise<void> {
  return apiFetch<void>(`/api/clusters/${clusterId}`, token, {
    method: "DELETE",
  });
}

export async function fetchHealRules(
  token: string,
  clusterId: string,
): Promise<HealRulesResponse> {
  return apiFetch<HealRulesResponse>(
    `/api/clusters/${clusterId}/heal-rules`,
    token,
  );
}

export async function updateHealRules(
  token: string,
  clusterId: string,
  payload: {
    enabled: string[];
    modes?: Record<string, "auto" | "approval">;
    concurrencyMode?: "concurrent" | "sequential";
    healJobPods?: boolean;
    healWorkerPods?: boolean;
  },
): Promise<HealRulesResponse> {
  return apiFetch<HealRulesResponse>(
    `/api/clusters/${clusterId}/heal-rules`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function fetchLocalKubeconfig(
  token: string,
): Promise<LocalKubeconfigResponse> {
  return apiFetch<LocalKubeconfigResponse>("/api/clusters/local-kubeconfig", token);
}

export async function connectCluster(
  token: string,
  body: {
    name: string;
    kubeconfig: string;
    contextName?: string;
    namespaceFilter?: string[];
  },
): Promise<ConnectClusterResult> {
  return apiFetch<ConnectClusterResult>("/api/clusters/connect", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Fast path: agent reads ~/.kube/config on the host (no kubeconfig upload). */
export async function connectLocalCluster(
  token: string,
  body: {
    name: string;
    contextName?: string;
    namespaceFilter?: string[];
  },
): Promise<ConnectClusterResult> {
  return apiFetch<ConnectClusterResult>("/api/clusters/connect/local", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createClusterRegistration(
  token: string,
  body: { name: string; namespaceFilter?: string[] },
): Promise<ClusterRegistration> {
  return apiFetch<ClusterRegistration>("/api/clusters/registration", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchRegistrationStatus(
  token: string,
  registerToken: string,
): Promise<RegistrationStatus> {
  return apiFetch<RegistrationStatus>(
    `/api/clusters/registration/${registerToken}`,
    token,
  );
}

function formatApiErrorBody(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (typeof error !== "object" || error === null) return null;
  const zod = error as {
    formErrors?: string[];
    fieldErrors?: Record<string, string[]>;
  };
  const parts: string[] = [];
  if (zod.formErrors?.length) parts.push(...zod.formErrors);
  if (zod.fieldErrors) {
    for (const [field, msgs] of Object.entries(zod.fieldErrors)) {
      if (msgs?.length) parts.push(`${field}: ${msgs.join(", ")}`);
    }
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

export function parseApiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const parsed = JSON.parse(err.message) as {
        error?: unknown;
        message?: string;
      };
      if (
        typeof parsed.message === "string" &&
        parsed.message.startsWith("Route ")
      ) {
        return `${parsed.message} Restart the Cognix agent (pnpm dev:agent) to load the latest routes.`;
      }
      const formatted = formatApiErrorBody(parsed.error);
      if (formatted) return formatted;
      if (typeof parsed.message === "string" && parsed.message) {
        return parsed.message;
      }
    } catch {
      // plain text body
    }
    return err.message || `Request failed (${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

export async function approveHeal(
  healId: string,
  token: string,
): Promise<{ heal: unknown; status: string }> {
  return apiFetch(`/api/heals/${healId}/approve`, token, { method: "POST" });
}

export async function rejectHeal(
  healId: string,
  token: string,
): Promise<{ heal: unknown; status: string }> {
  return apiFetch(`/api/heals/${healId}/reject`, token, { method: "POST" });
}

export async function fetchHealTerminal(
  healId: string,
  token: string,
): Promise<HealTerminalResponse> {
  return apiFetch<HealTerminalResponse>(`/api/heals/${healId}/terminal`, token);
}

export async function fetchLiveTerminal(
  clusterId: string,
  token: string,
  limit = 500,
): Promise<LiveTerminalResponse> {
  return apiFetch<LiveTerminalResponse>(
    `/api/heals/terminal/live?clusterId=${clusterId}&limit=${limit}`,
    token,
  );
}

export async function fetchUsers(token: string): Promise<UsersListResponse> {
  return apiFetch<UsersListResponse>("/api/users", token);
}

export async function createUser(
  token: string,
  body: {
    email: string;
    name: string;
    username?: string;
    role?: AppUserRole;
  },
): Promise<CreateUserResponse> {
  return apiFetch<CreateUserResponse>("/api/users", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateUser(
  token: string,
  userId: string,
  body: {
    name?: string;
    username?: string | null;
    role?: AppUserRole;
    active?: boolean;
  },
): Promise<{ user: AppUser }> {
  return apiFetch<{ user: AppUser }>(`/api/users/${userId}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function resetUserPassword(
  token: string,
  userId: string,
): Promise<ResetPasswordResponse> {
  return apiFetch<ResetPasswordResponse>(
    `/api/users/${userId}/reset-password`,
    token,
    { method: "POST" },
  );
}

export async function deleteUser(
  token: string,
  userId: string,
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/users/${userId}`, token, {
    method: "DELETE",
  });
}

export async function fetchSsoConfig(token: string): Promise<SsoConfigResponse> {
  return apiFetch<SsoConfigResponse>("/api/agent/sso-config", token);
}

export async function updateSsoConfig(
  token: string,
  patch: SsoConfigPatch,
): Promise<SsoConfigResponse> {
  return apiFetch<SsoConfigResponse>("/api/agent/sso-config", token, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function resetSsoConfig(
  token: string,
  provider: SsoProviderId,
): Promise<SsoConfigResponse> {
  return apiFetch<SsoConfigResponse>("/api/agent/sso-config/reset", token, {
    method: "POST",
    body: JSON.stringify({ provider }),
  });
}
