import { DEFAULT_ANTHROPIC_MODEL } from "@kubehealer/shared";

import type { LlmCompletionResult } from "./ollama.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

interface AnthropicMessageResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export async function callAnthropic(
  apiKey: string,
  system: string,
  prompt: string,
  timeoutMs = 30_000,
  model = DEFAULT_ANTHROPIC_MODEL,
): Promise<LlmCompletionResult> {
  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic request failed: ${res.status} — ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as AnthropicMessageResponse;
  const text = data.content
    ?.filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Anthropic returned empty completion");
  }

  const promptTokens = data.usage?.input_tokens;
  const completionTokens = data.usage?.output_tokens;

  return {
    text,
    promptTokens,
    completionTokens,
    totalTokens:
      promptTokens != null && completionTokens != null
        ? promptTokens + completionTokens
        : undefined,
  };
}
