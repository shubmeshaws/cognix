import type { LlmCompletionResult } from "./ollama.js";

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface OpenAiCompatOptions {
  /** When false, omits response_format (Puter models may reject json_object). */
  jsonMode?: boolean;
  /** Puter puterai endpoints require the app origin (user session). */
  origin?: string;
}

export async function callOpenAiCompat(
  baseUrl: string,
  apiKey: string,
  system: string,
  prompt: string,
  timeoutMs = 30_000,
  model = "gpt-4o-mini",
  options: OpenAiCompatOptions = {},
): Promise<LlmCompletionResult> {
  const root = baseUrl.replace(/\/$/, "");
  const url = `${root}/chat/completions`;
  const body: Record<string, unknown> = {
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  };
  if (options.jsonMode !== false) {
    body.response_format = { type: "json_object" };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (options.origin) {
    headers.Origin = options.origin;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM request failed: ${res.status} — ${body}`);
  }

  const data = (await res.json()) as OpenAiChatResponse;
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("LLM returned empty completion");
  }

  return {
    text,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
    totalTokens: data.usage?.total_tokens,
  };
}
