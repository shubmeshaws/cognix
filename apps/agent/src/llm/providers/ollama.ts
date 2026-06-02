export interface LlmCompletionResult {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface OllamaGenerateResponse {
  response: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export async function callOllama(
  baseUrl: string,
  system: string,
  prompt: string,
  timeoutMs = 8_000,
  model = "llama3.1:8b",
): Promise<LlmCompletionResult> {
  const url = new URL("/api/generate", baseUrl).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      system,
      prompt,
      stream: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as OllamaGenerateResponse;
  const promptTokens = data.prompt_eval_count;
  const completionTokens = data.eval_count;

  return {
    text: data.response,
    promptTokens,
    completionTokens,
    totalTokens:
      promptTokens !== undefined && completionTokens !== undefined
        ? promptTokens + completionTokens
        : undefined,
  };
}
