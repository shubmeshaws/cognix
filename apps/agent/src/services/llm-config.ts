import {
  normalizeLlmChain,
  type LlmProviderChain,
  type LlmProviderId,
} from "@kubehealer/shared";

import type { Env } from "../config/env.js";
import {
  getEffectiveLlmChain,
  getEffectiveOllamaModel,
  getEffectiveOllamaUrl,
  getEffectiveOpenAiKey,
  getEffectiveOpenAiModel,
  getEffectivePuterAuthToken,
  getEffectivePuterModel,
  getLlmRuntime,
  maskApiKey,
  setLlmRuntime,
  type LlmRuntimeOverrides,
} from "../config/llm-runtime.js";
import {
  fetchOllamaTags,
  ollamaModelMatches,
  resolveOllamaModel,
} from "../llm/ollama-models.js";
import { callOpenAi } from "../llm/providers/openai.js";
import { callPuter } from "../llm/providers/puter.js";

export interface LlmConfigResponse {
  llmChain: LlmProviderChain;
  ollamaUrl: string;
  ollamaModel: string;
  openaiModel: string;
  puterModel: string;
  openaiApiKeySet: boolean;
  openaiApiKeyPreview: string | null;
  puterAuthTokenSet: boolean;
  puterAuthTokenPreview: string | null;
  envOllamaUrl: string;
  envOpenaiConfigured: boolean;
  envPuterConfigured: boolean;
}

export function getLlmConfigResponse(env: Env): LlmConfigResponse {
  const openaiKey = getEffectiveOpenAiKey(env);
  const puterToken = getEffectivePuterAuthToken(env);

  return {
    llmChain: getEffectiveLlmChain(),
    ollamaUrl: getEffectiveOllamaUrl(env),
    ollamaModel: getEffectiveOllamaModel(),
    openaiModel: getEffectiveOpenAiModel(),
    puterModel: getEffectivePuterModel(),
    openaiApiKeySet: Boolean(openaiKey),
    openaiApiKeyPreview: maskApiKey(openaiKey),
    puterAuthTokenSet: Boolean(puterToken),
    puterAuthTokenPreview: maskApiKey(puterToken),
    envOllamaUrl: env.OLLAMA_URL,
    envOpenaiConfigured: Boolean(env.OPENAI_API_KEY),
    envPuterConfigured: Boolean(env.PUTER_AUTH_TOKEN),
  };
}

export async function applyLlmConfigPatch(
  env: Env,
  patch: LlmRuntimeOverrides & { puterAppOrigin?: string },
): Promise<LlmConfigResponse> {
  const normalized: LlmRuntimeOverrides = { ...patch };
  if (patch.llmChain !== undefined) {
    normalized.llmChain = normalizeLlmChain(patch.llmChain);
  }
  delete (normalized as { puterAppOrigin?: string }).puterAppOrigin;
  setLlmRuntime(normalized);
  return getLlmConfigResponse(env);
}

export async function testOllamaConnection(
  env: Env,
  url?: string,
  model?: string,
): Promise<{ ok: boolean; message: string }> {
  const base = url?.trim() || getEffectiveOllamaUrl(env);
  const preferred = model?.trim() || getEffectiveOllamaModel();
  try {
    const tags = await fetchOllamaTags(base);
    const models = tags.models ?? [];

    if (!models.length) {
      return {
        ok: false,
        message: `Ollama is reachable at ${base} but no models are installed. Run: ollama pull ${preferred}`,
      };
    }

    const { model: resolved, autoSelected } = resolveOllamaModel(
      models,
      preferred,
    );

    if (!ollamaModelMatches(models, resolved)) {
      const available = models.map((x) => x.name).slice(0, 5);
      return {
        ok: false,
        message: `Model “${preferred}” not found. Available: ${available.join(", ")}${models.length > 5 ? "…" : ""}. Run: ollama pull ${preferred}`,
      };
    }

    const autoNote = autoSelected
      ? ` (auto-selected “${resolved}” — update Settings to use it by default)`
      : "";
    return {
      ok: true,
      message: `Connected to Ollama — model “${resolved}” is available${autoNote}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      return {
        ok: false,
        message: `Cannot reach Ollama at ${base}. Start Ollama or check the URL.`,
      };
    }
    return { ok: false, message: msg };
  }
}

export async function testOpenAiConnection(
  env: Env,
  apiKey?: string,
  model?: string,
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey?.trim() || getEffectiveOpenAiKey(env);
  const m = model?.trim() || getEffectiveOpenAiModel();
  if (!key) {
    return {
      ok: false,
      message:
        "Not configured — add an OpenAI API key in Settings to test (optional).",
    };
  }
  try {
    await callOpenAi(key, "You are a test.", "Reply with OK", 15_000, m);
    return { ok: true, message: `Connected — model “${m}” responded` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

function puterAppOrigin(env: Env, override?: string): string {
  return (
    override?.trim() ||
    env.PUTER_APP_ORIGIN?.trim() ||
    "http://localhost:3000"
  );
}

export async function testPuterConnection(
  env: Env,
  authToken?: string,
  model?: string,
  appOrigin?: string,
): Promise<{ ok: boolean; message: string }> {
  const token = authToken?.trim() || getEffectivePuterAuthToken(env);
  const m = model?.trim() || getEffectivePuterModel();
  if (!token) {
    return {
      ok: false,
      message: "Puter sign-in required — sign in with Puter in Settings, then Apply",
    };
  }
  try {
    await callPuter(
      token,
      "You are a test.",
      "Reply with OK",
      20_000,
      m,
      puterAppOrigin(env, appOrigin),
    );
    return {
      ok: true,
      message: `Connected to Puter.js — model “${m}” responded`,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Connection failed";
    const needsReauth =
      raw.includes("token_auth_failed") ||
      raw.includes("token exchange failed");
    return {
      ok: false,
      message: needsReauth
        ? `${raw} — sign in with Puter again in Settings, then Apply to agent.`
        : raw,
    };
  }
}

export async function testLlmProvider(
  env: Env,
  provider: LlmProviderId,
  opts: {
    ollamaUrl?: string;
    ollamaModel?: string;
    openaiApiKey?: string;
    openaiModel?: string;
    puterAuthToken?: string;
    puterModel?: string;
    puterAppOrigin?: string;
  },
): Promise<{ ok: boolean; message: string }> {
  switch (provider) {
    case "ollama":
      return testOllamaConnection(env, opts.ollamaUrl, opts.ollamaModel);
    case "openai":
      return testOpenAiConnection(env, opts.openaiApiKey, opts.openaiModel);
    case "puter":
      return testPuterConnection(
        env,
        opts.puterAuthToken,
        opts.puterModel,
        opts.puterAppOrigin,
      );
    default:
      return { ok: false, message: "Unknown provider" };
  }
}
