import {
  DEFAULT_LLM_CHAIN,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_PUTER_MODEL,
  normalizeLlmChain,
  type LlmProviderChain,
  type LlmProviderId,
} from "@kubehealer/shared";

import type { Env } from "./env.js";

/** @deprecated Legacy single-preference mode; migrated to llmChain. */
export type LlmPreference = "ollama" | "openai" | "ollama_then_openai";

export interface LlmRuntimeOverrides {
  llmChain?: LlmProviderChain;
  /** @deprecated Use llmChain */
  llmPreference?: LlmPreference;
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

let overrides: LlmRuntimeOverrides = {};

export function setLlmRuntime(patch: LlmRuntimeOverrides): void {
  if (patch.llmChain) {
    const { llmPreference: _drop, ...rest } = overrides;
    overrides = { ...rest, ...patch };
    return;
  }
  overrides = { ...overrides, ...patch };
}

export function clearLlmRuntime(): void {
  overrides = {};
}

export function getLlmRuntime(): Readonly<LlmRuntimeOverrides> {
  return overrides;
}

export function getEffectiveLlmChain(): LlmProviderChain {
  if (overrides.llmChain) {
    return normalizeLlmChain(overrides.llmChain);
  }
  return normalizeLlmChain(undefined, overrides.llmPreference);
}

export function getEffectiveOllamaUrl(env: Env): string {
  return overrides.ollamaUrl?.trim() || env.OLLAMA_URL;
}

export function getEffectiveOllamaModel(): string {
  return overrides.ollamaModel?.trim() || "llama3.2:1b";
}

export function getEffectiveOpenAiKey(env: Env): string | undefined {
  const key = overrides.openaiApiKey?.trim();
  if (key) return key;
  return env.OPENAI_API_KEY;
}

export function getEffectiveOpenAiModel(): string {
  return overrides.openaiModel?.trim() || "gpt-4o-mini";
}

export function getEffectiveAnthropicKey(env: Env): string | undefined {
  const key = overrides.anthropicApiKey?.trim();
  if (key) return key;
  return env.ANTHROPIC_API_KEY;
}

export function getEffectiveAnthropicModel(): string {
  return overrides.anthropicModel?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

export function getEffectivePuterAuthToken(env: Env): string | undefined {
  const token = overrides.puterAuthToken?.trim();
  if (token) return token;
  return env.PUTER_AUTH_TOKEN;
}

export function getEffectivePuterModel(): string {
  return overrides.puterModel?.trim() || DEFAULT_PUTER_MODEL;
}

export function getEffectivePuterAppOrigin(env: Env): string {
  return (
    overrides.puterAppOrigin?.trim() ||
    env.PUTER_APP_ORIGIN?.trim() ||
    "http://localhost:3000"
  );
}

/** @deprecated Use getEffectiveLlmChain */
export function getEffectiveLlmPreference(): LlmPreference {
  const chain = getEffectiveLlmChain();
  const [a, b] = chain;
  if (a === "openai" && !b) return "openai";
  if (a === "ollama" && !b) return "ollama";
  if (a === "ollama" && b === "openai") return "ollama_then_openai";
  return "ollama_then_openai";
}

export function isProviderConfigured(
  provider: LlmProviderId,
  env: Env,
): boolean {
  switch (provider) {
    case "ollama":
      return Boolean(getEffectiveOllamaUrl(env));
    case "openai":
      return Boolean(getEffectiveOpenAiKey(env));
    case "anthropic":
      return Boolean(getEffectiveAnthropicKey(env));
    case "puter":
      return Boolean(getEffectivePuterAuthToken(env));
    default:
      return false;
  }
}

export function getConfiguredChain(env: Env): LlmProviderId[] {
  const explicit = getEffectiveLlmChain().filter(
    (p): p is LlmProviderId => p !== null && isProviderConfigured(p, env),
  );

  // If user explicitly configured a chain (even partially), use it as-is.
  if (explicit.length > 0) return explicit;

  // Auto-detect available providers from environment when no chain configured.
  // This lets Ollama work out-of-the-box when OLLAMA_URL is set in .env
  // without requiring the user to go to Settings → Apply first.
  const detected: LlmProviderId[] = [];
  if (isProviderConfigured("ollama", env)) detected.push("ollama");
  if (isProviderConfigured("openai", env)) detected.push("openai");
  if (isProviderConfigured("anthropic", env)) detected.push("anthropic");
  if (isProviderConfigured("puter", env)) detected.push("puter");
  return detected;
}

export function maskApiKey(key: string | undefined): string | null {
  if (!key?.trim()) return null;
  const k = key.trim();
  if (k.length <= 8) return "••••••••";
  return `${k.slice(0, 3)}••••${k.slice(-4)}`;
}

export { DEFAULT_LLM_CHAIN };
