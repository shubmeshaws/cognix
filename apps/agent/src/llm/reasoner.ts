import type { LlmProviderId } from "@kubehealer/shared";

import type { Env } from "../config/env.js";
import {
  getConfiguredChain,
  getEffectiveAnthropicKey,
  getEffectiveAnthropicModel,
  getEffectiveOllamaModel,
  getEffectiveOllamaUrl,
  getEffectiveOpenAiKey,
  getEffectiveOpenAiModel,
  getEffectivePuterAppOrigin,
  getEffectivePuterAuthToken,
  getEffectivePuterModel,
  isProviderConfigured,
} from "../config/llm-runtime.js";
import { parseDiagnosis } from "./parse.js";
import { buildUserPrompt } from "./prompts/index.js";
import { SYSTEM_PROMPT } from "./prompts/system.js";
import { callAnthropic } from "./providers/anthropic.js";
import { callOllama } from "./providers/ollama.js";
import { callOpenAi } from "./providers/openai.js";
import { callPuter } from "./providers/puter.js";
import type { DiagnosePodInput, PodDiagnosis } from "./types.js";

export type { DiagnosePodInput, PodDiagnosis };

interface ReasonerLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface PodReasonerOptions {
  env: Env;
  log?: ReasonerLogger;
  /** Override for tests */
  complete?: (system: string, prompt: string) => Promise<{
    text: string;
    provider: LlmProviderId;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs: number;
  }>;
}

function isProviderUnreachable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      err.name === "TimeoutError" ||
      err.name === "AbortError" ||
      msg.includes("timeout") ||
      msg.includes("fetch failed") ||
      msg.includes("econnrefused") ||
      msg.includes("not configured") ||
      msg.includes("request failed") ||
      msg.includes("ollama request failed")
    );
  }
  return false;
}

export class PodReasoner {
  private readonly env: Env;
  private readonly log?: ReasonerLogger;
  private readonly completeFn?: PodReasonerOptions["complete"];

  constructor(options: PodReasonerOptions) {
    this.env = options.env;
    this.log = options.log;
    this.completeFn = options.complete;
  }

  async diagnosePod(input: DiagnosePodInput): Promise<PodDiagnosis> {
    const userPrompt = buildUserPrompt(input);
    let lastRaw = "";
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      const completion = await (this.completeFn ?? this.complete.bind(this))(
        SYSTEM_PROMPT,
        userPrompt,
      );

      this.log?.info(
        {
          provider: completion.provider,
          latencyMs: completion.latencyMs,
          promptTokens: completion.promptTokens,
          completionTokens: completion.completionTokens,
          totalTokens: completion.totalTokens,
          pod: `${input.namespace}/${input.podName}`,
          issueType: input.issueType,
          attempt: attempt + 1,
        },
        "llm diagnosis completed",
      );

      lastRaw = completion.text;

      try {
        return parseDiagnosis(completion.text);
      } catch (err) {
        lastError = err;
        this.log?.warn(
          {
            err,
            attempt: attempt + 1,
            responseLength: completion.text.length,
          },
          "llm response parse failed, retrying",
        );
      }
    }

    this.log?.error({ err: lastError, response: lastRaw.slice(0, 500) }, "llm diagnosis failed");
    throw new Error(
      `Failed to parse LLM diagnosis after 2 attempts: ${lastError instanceof Error ? lastError.message : "unknown"}`,
    );
  }

  private async complete(
    system: string,
    prompt: string,
  ): Promise<{
    text: string;
    provider: LlmProviderId;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs: number;
  }> {
    const chain = getConfiguredChain(this.env);
    if (chain.length === 0) {
      throw new Error(
        "No LLM providers configured. Set primary/fallback chain in Settings.",
      );
    }

    const errors: unknown[] = [];

    for (const provider of chain) {
      try {
        return await this.completeWithProvider(provider, system, prompt);
      } catch (err) {
        errors.push(err);
        if (!isProviderUnreachable(err)) {
          throw err;
        }
        this.log?.warn(
          { err, provider },
          "llm provider failed, trying next in chain",
        );
      }
    }

    const last = errors[errors.length - 1];
    throw last instanceof Error
      ? last
      : new Error("All LLM providers in the chain failed");
  }

  private async completeWithProvider(
    provider: LlmProviderId,
    system: string,
    prompt: string,
  ): Promise<{
    text: string;
    provider: LlmProviderId;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs: number;
  }> {
    if (!isProviderConfigured(provider, this.env)) {
      throw new Error(`${provider} is not configured`);
    }

    const start = performance.now();

    switch (provider) {
      case "ollama": {
        const result = await callOllama(
          getEffectiveOllamaUrl(this.env),
          system,
          prompt,
          90_000,
          getEffectiveOllamaModel(),
        );
        return {
          text: result.text,
          provider: "ollama",
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          latencyMs: Math.round(performance.now() - start),
        };
      }
      case "openai": {
        const key = getEffectiveOpenAiKey(this.env);
        if (!key) throw new Error("OpenAI API key is not configured");
        const result = await callOpenAi(
          key,
          system,
          prompt,
          30_000,
          getEffectiveOpenAiModel(),
        );
        return {
          text: result.text,
          provider: "openai",
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          latencyMs: Math.round(performance.now() - start),
        };
      }
      case "anthropic": {
        const key = getEffectiveAnthropicKey(this.env);
        if (!key) throw new Error("Anthropic API key is not configured");
        const result = await callAnthropic(
          key,
          system,
          prompt,
          30_000,
          getEffectiveAnthropicModel(),
        );
        return {
          text: result.text,
          provider: "anthropic",
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          latencyMs: Math.round(performance.now() - start),
        };
      }
      case "puter": {
        const token = getEffectivePuterAuthToken(this.env);
        if (!token) throw new Error("Puter auth token is not configured");
        const result = await callPuter(
          token,
          system,
          prompt,
          30_000,
          getEffectivePuterModel(),
          getEffectivePuterAppOrigin(this.env),
        );
        return {
          text: result.text,
          provider: "puter",
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          latencyMs: Math.round(performance.now() - start),
        };
      }
      default: {
        const _exhaustive: never = provider;
        throw new Error(`Unknown provider: ${String(_exhaustive)}`);
      }
    }
  }
}

export async function diagnosePod(
  input: DiagnosePodInput,
  options: PodReasonerOptions,
): Promise<PodDiagnosis> {
  return new PodReasoner(options).diagnosePod(input);
}
