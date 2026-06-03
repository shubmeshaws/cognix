import {
  LLM_CHAIN_SLOT_LABELS,
  LLM_PROVIDER_CATALOG,
  type LlmProviderId,
} from "@kubehealer/shared";

import type { AgentSettings, HealingMode } from "@/stores/settings";
import type { AgentStatus } from "@/types/api";

export interface ConfigRow {
  id: string;
  label: string;
  value: string;
  tooltip: string;
  configurable: boolean;
}

export const HEALING_MODE_OPTIONS: {
  value: HealingMode;
  label: string;
  description: string;
}[] = [
  {
    value: "autonomous_with_approval",
    label: "Autonomous + approval gate",
    description:
      "The agent diagnoses issues automatically. Risky heals wait for your approve/reject in the dashboard.",
  },
  {
    value: "approval_required",
    label: "Approval required",
    description:
      "Every heal action requires explicit approval before the agent applies a fix.",
  },
  {
    value: "observe_only",
    label: "Observe only",
    description:
      "Detect and display issues only — no automatic healing or approvals (monitoring mode).",
  },
];

function providerLabel(id: LlmProviderId): string {
  return LLM_PROVIDER_CATALOG.find((p) => p.id === id)?.label ?? id;
}

function providerStatus(
  id: LlmProviderId,
  settings: AgentSettings,
  agent: AgentStatus | undefined,
): string {
  switch (id) {
    case "ollama": {
      const ok = agent?.llm.ollama.ok ?? false;
      return ok
        ? `${settings.ollamaModel}`
        : `offline · ${settings.ollamaUrl}`;
    }
    case "openai": {
      const ok =
        agent?.llm.openai.configured ?? Boolean(settings.openaiApiKey.trim());
      return ok ? settings.openaiModel : "key not set";
    }
    case "anthropic": {
      const ok =
        agent?.llm.anthropic.configured ??
        Boolean(settings.anthropicApiKey.trim());
      return ok ? settings.anthropicModel : "key not set";
    }
    case "puter": {
      const ok =
        agent?.llm.puter.configured ?? Boolean(settings.puterAuthToken.trim());
      return ok ? settings.puterModel : "sign in required";
    }
    default:
      return "—";
  }
}

function chainDisplayValue(
  settings: AgentSettings,
  agent: AgentStatus | undefined,
): string {
  const parts = settings.llmChain
    .map((p, i) => {
      if (!p) return null;
      const slot = LLM_CHAIN_SLOT_LABELS[i];
      return `${slot}: ${providerLabel(p)} (${providerStatus(p, settings, agent)})`;
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" → ") : "No providers configured";
}

function modeDisplayValue(mode: HealingMode): string {
  return (
    HEALING_MODE_OPTIONS.find((o) => o.value === mode)?.label ??
    "Autonomous + approval gate"
  );
}

function approvalDisplayValue(
  mode: HealingMode,
  pendingApprovals: number,
): string {
  if (mode === "observe_only") return "Disabled (observe only)";
  if (pendingApprovals > 0) return `${pendingApprovals} pending`;
  return "None pending";
}

export function buildAgentConfigRows(
  settings: AgentSettings,
  agent: AgentStatus | undefined,
  pendingApprovals: number,
  wsConnected: boolean,
): ConfigRow[] {
  const modeOpt = HEALING_MODE_OPTIONS.find((o) => o.value === settings.healingMode);

  return [
    {
      id: "llm-chain",
      label: "LLM chain",
      value: chainDisplayValue(settings, agent),
      tooltip:
        "Primary, 1st fallback, and 2nd fallback providers for pod diagnosis. Edit in Settings.",
      configurable: true,
    },
    {
      id: "mode",
      label: "Mode",
      value: modeDisplayValue(settings.healingMode),
      tooltip:
        modeOpt?.description ??
        "How aggressively the agent applies fixes after diagnosis.",
      configurable: true,
    },
    {
      id: "approval",
      label: "Approval gate",
      value: approvalDisplayValue(settings.healingMode, pendingApprovals),
      tooltip:
        "Human-in-the-loop step before destructive heals. Pending count reflects heals waiting for your decision.",
      configurable: true,
    },
    {
      id: "auth",
      label: "Cluster auth",
      value: wsConnected ? "JWT + kubeconfig" : "Disconnected",
      tooltip:
        "How the dashboard talks to the agent (Bearer JWT) and how the agent reaches your cluster (kubeconfig or in-cluster).",
      configurable: false,
    },
    {
      id: "watcher",
      label: "Watcher",
      value: agent
        ? `${agent.watcher.connectedClusters} cluster(s), ${agent.watcher.wsClients} WS`
        : "—",
      tooltip:
        "Live pod watchers and WebSocket clients streaming events to the dashboard. WS count is browser connections.",
      configurable: false,
    },
  ];
}
