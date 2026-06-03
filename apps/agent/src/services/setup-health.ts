import { sql } from "drizzle-orm";

import type { LlmProviderId } from "@kubehealer/shared";

import type { ServerDeps } from "../context/deps.js";
import {
  getConfiguredChain,
  getEffectiveOllamaModel,
  getEffectiveOllamaUrl,
  getEffectiveOpenAiKey,
  getEffectiveAnthropicKey,
  getEffectivePuterAuthToken,
} from "../config/llm-runtime.js";
import {
  fetchOllamaTags,
  ollamaModelMatches,
  resolveOllamaModel,
} from "../llm/ollama-models.js";
import { getEffectiveTeamsWebhookUrl } from "./teams-config.js";

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

function providerReady(
  provider: LlmProviderId,
  deps: ServerDeps,
  ollamaOk: boolean,
): boolean {
  switch (provider) {
    case "ollama":
      return ollamaOk;
    case "openai":
      return Boolean(getEffectiveOpenAiKey(deps.env));
    case "anthropic":
      return Boolean(getEffectiveAnthropicKey(deps.env));
    case "puter":
      return Boolean(getEffectivePuterAuthToken(deps.env));
    default:
      return false;
  }
}

export async function getSetupHealth(deps: ServerDeps): Promise<SetupHealthResponse> {
  const checks: SetupHealthCheck[] = [];

  checks.push({
    id: "agent",
    ok: true,
    detail: "Agent API is running",
    meta: {
      uptimeSec: Math.floor((Date.now() - deps.startedAt) / 1000),
    },
  });

  try {
    await deps.db.execute(sql`SELECT 1`);
    checks.push({
      id: "database",
      ok: true,
      detail: "PostgreSQL is reachable",
    });
  } catch (err) {
    checks.push({
      id: "database",
      ok: false,
      detail:
        err instanceof Error
          ? err.message
          : "Cannot connect to PostgreSQL",
    });
  }

  const ollamaUrl = getEffectiveOllamaUrl(deps.env);
  const ollamaModel = getEffectiveOllamaModel();
  let ollamaOk = false;
  let ollamaDetail = "Ollama is not reachable";
  try {
    const tags = await fetchOllamaTags(ollamaUrl);
    const models = tags.models ?? [];
    if (!models.length) {
      ollamaDetail = `Ollama is running but no models are installed`;
    } else {
      const { model: resolved, autoSelected } = resolveOllamaModel(
        models,
        ollamaModel,
      );
      if (ollamaModelMatches(models, resolved)) {
        ollamaOk = true;
        ollamaDetail = autoSelected
          ? `Using “${resolved}” (${ollamaModel} is not installed)`
          : `Model “${resolved}” is available`;
      } else {
        ollamaDetail = `Model “${ollamaModel}” is not installed`;
      }
    }
  } catch (err) {
    ollamaDetail =
      err instanceof Error ? err.message : "Cannot reach Ollama";
  }

  const activeChain = getConfiguredChain(deps.env);
  const primary = activeChain[0] ?? null;
  const usesOllama = activeChain.includes("ollama");

  if (usesOllama) {
    checks.push({
      id: "ollama",
      ok: ollamaOk,
      detail: ollamaDetail,
      meta: { url: ollamaUrl, model: ollamaModel },
    });
  } else {
    checks.push({
      id: "ollama",
      ok: true,
      detail: "Not in your LLM provider chain",
      meta: { optional: true, skipped: true },
    });
  }

  if (!primary) {
    checks.push({
      id: "llm",
      ok: false,
      detail: "No LLM provider in your chain — configure one in Settings",
    });
  } else {
    const primaryReady = providerReady(primary, deps, ollamaOk);
    checks.push({
      id: "llm",
      ok: primaryReady,
      detail: primaryReady
        ? `Primary provider “${primary}” is ready`
        : `Primary provider “${primary}” is not ready`,
      meta: { primary, chain: activeChain.join(",") },
    });
  }

  const connected = deps.watcher.activeClusterCount;
  const registered = deps.clusterHub.connectedClusters();
  checks.push({
    id: "cluster",
    ok: connected > 0,
    detail:
      connected > 0
        ? `${connected} cluster watcher${connected === 1 ? "" : "s"} active`
        : registered > 0
          ? `${registered} cluster(s) registered but none connected — check kubeconfig`
          : "No Kubernetes cluster connected",
    meta: { connected, registered },
  });

  const teamsConfigured = Boolean(getEffectiveTeamsWebhookUrl(deps.env));
  checks.push({
    id: "teams",
    ok: teamsConfigured,
    detail: teamsConfigured
      ? "Microsoft Teams webhook configured"
      : "Optional — not configured",
    meta: { optional: true },
  });

  return {
    checkedAt: new Date().toISOString(),
    checks,
  };
}
