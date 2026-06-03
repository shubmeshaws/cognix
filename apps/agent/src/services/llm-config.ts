import {
  normalizeLlmChain,
  type LlmProviderChain,
  type LlmProviderId,
} from "@kubehealer/shared";

import { saveLlmConfigToDisk } from "../config/llm-config-store.js";
import type { Env } from "../config/env.js";
import {
  getEffectiveLlmChain,
  getEffectiveAnthropicKey,
  getEffectiveAnthropicModel,
  getEffectiveOllamaModel,
  getEffectiveOllamaUrl,
  getEffectiveOpenAiKey,
  getEffectiveOpenAiModel,
  getEffectivePuterAppOrigin,
  getEffectivePuterAuthToken,
  getEffectivePuterModel,
  getLlmRuntime,
  maskApiKey,
  setLlmRuntime,
  getConfiguredChain,
  type LlmRuntimeOverrides,
} from "../config/llm-runtime.js";
import {
  fetchOllamaTags,
  ollamaModelMatches,
  resolveOllamaModel,
} from "../llm/ollama-models.js";
import { callOpenAiCompat } from "../llm/providers/openai-compat.js";
import { callAnthropic } from "../llm/providers/anthropic.js";
import { callPuter } from "../llm/providers/puter.js";

export interface LlmConfigResponse {
  llmChain: LlmProviderChain;
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
  activeChain: LlmProviderId[];
}

export function getLlmConfigResponse(env: Env): LlmConfigResponse {
  const openaiKey = getEffectiveOpenAiKey(env);
  const anthropicKey = getEffectiveAnthropicKey(env);
  const puterToken = getEffectivePuterAuthToken(env);

  return {
    llmChain: getEffectiveLlmChain(),
    ollamaUrl: getEffectiveOllamaUrl(env),
    ollamaModel: getEffectiveOllamaModel(),
    openaiModel: getEffectiveOpenAiModel(),
    anthropicModel: getEffectiveAnthropicModel(),
    puterModel: getEffectivePuterModel(),
    openaiApiKeySet: Boolean(openaiKey),
    openaiApiKeyPreview: maskApiKey(openaiKey),
    anthropicApiKeySet: Boolean(anthropicKey),
    anthropicApiKeyPreview: maskApiKey(anthropicKey),
    puterAuthTokenSet: Boolean(puterToken),
    puterAuthTokenPreview: maskApiKey(puterToken),
    puterAppOrigin: getEffectivePuterAppOrigin(env),
    envOllamaUrl: env.OLLAMA_URL,
    envOpenaiConfigured: Boolean(env.OPENAI_API_KEY),
    envAnthropicConfigured: Boolean(env.ANTHROPIC_API_KEY),
    envPuterConfigured: Boolean(env.PUTER_AUTH_TOKEN),
    activeChain: getConfiguredChain(env),
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

  const ollamaUrl = normalized.ollamaUrl?.trim() || getEffectiveOllamaUrl(env);
  const ollamaModel =
    normalized.ollamaModel?.trim() || getEffectiveOllamaModel();
  if (ollamaUrl && ollamaModel) {
    try {
      const tags = await fetchOllamaTags(ollamaUrl);
      const { model, autoSelected } = resolveOllamaModel(tags.models, ollamaModel);
      if (autoSelected) {
        normalized.ollamaModel = model;
      }
    } catch {
      // Keep user-provided model if Ollama is temporarily unreachable.
    }
  }

  setLlmRuntime(normalized);
  await saveLlmConfigToDisk();
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

    if (autoSelected) {
      return {
        ok: true,
        message:
          `Connected to Ollama — using “${resolved}” because “${preferred}” is not installed. ` +
          `Click **Apply to agent** in Settings to save “${resolved}” as your default model.`,
      };
    }
    return {
      ok: true,
      message: `Connected to Ollama — model “${resolved}” is available`,
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
    await callOpenAiCompat(
      "https://api.openai.com/v1",
      key,
      "You are a test.",
      "Reply with OK",
      15_000,
      m,
      { jsonMode: false },
    );
    return { ok: true, message: `Connected — model “${m}” responded` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

export async function testAnthropicConnection(
  env: Env,
  apiKey?: string,
  model?: string,
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey?.trim() || getEffectiveAnthropicKey(env);
  const m = model?.trim() || getEffectiveAnthropicModel();
  if (!key) {
    return {
      ok: false,
      message:
        "Not configured — add a Claude API key in Settings to test (optional).",
    };
  }
  try {
    await callAnthropic(key, "You are a test.", "Reply with OK", 20_000, m);
    return { ok: true, message: `Connected — model “${m}” responded` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

function puterAppOrigin(env: Env, override?: string): string {
  return override?.trim() || getEffectivePuterAppOrigin(env);
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
      raw.includes("token exchange failed") ||
      raw.includes("user sessions");
    return {
      ok: false,
      message: needsReauth
        ? `${raw} — in Settings, sign in with Puter (token is exchanged in the browser), then Apply to agent. Or paste a dashboard auth token from puter.com/dashboard.`
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
    anthropicApiKey?: string;
    anthropicModel?: string;
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
    case "anthropic":
      return testAnthropicConnection(
        env,
        opts.anthropicApiKey,
        opts.anthropicModel,
      );
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
