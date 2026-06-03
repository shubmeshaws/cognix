import {
  LLM_PROVIDER_CATALOG,
  type LlmProviderId,
} from "@kubehealer/shared";

import type { AgentStatus } from "@/types/api";

export interface ActiveLlmDisplay {
  provider: LlmProviderId | null;
  label: string;
  model: string;
  ok: boolean;
  detail: string;
}

function providerLabel(id: LlmProviderId): string {
  return LLM_PROVIDER_CATALOG.find((p) => p.id === id)?.label ?? id;
}

function providerReady(id: LlmProviderId, agent: AgentStatus | undefined): boolean {
  if (!agent?.llm) return false;
  switch (id) {
    case "ollama":
      return agent.llm.ollama.ok;
    case "openai":
      return agent.llm.openai.configured;
    case "anthropic":
      return agent.llm.anthropic.configured;
    case "puter":
      return agent.llm.puter.configured;
    default:
      return false;
  }
}

function providerModel(id: LlmProviderId, agent: AgentStatus | undefined): string {
  if (!agent?.llm) return "—";
  switch (id) {
    case "ollama":
      return agent.llm.ollama.model;
    case "openai":
      return agent.llm.openai.model;
    case "anthropic":
      return agent.llm.anthropic.model;
    case "puter":
      return agent.llm.puter.model;
    default:
      return "—";
  }
}

/** Primary provider from the agent's active chain (Settings → Apply). */
export function getActiveLlmDisplay(
  agent: AgentStatus | undefined,
): ActiveLlmDisplay {
  const primary = agent?.llm.activeChain?.[0] ?? null;

  if (!primary) {
    return {
      provider: null,
      label: "LLM",
      model: "Not configured",
      ok: false,
      detail: "Add a provider in Settings and Apply to agent",
    };
  }

  const ok = providerReady(primary, agent);
  const model = providerModel(primary, agent);

  return {
    provider: primary,
    label: providerLabel(primary),
    model,
    ok,
    detail: ok ? model : "Not ready — check Settings",
  };
}

export function chainsMatch(
  a: Array<LlmProviderId | null>,
  b: Array<LlmProviderId | null>,
): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
