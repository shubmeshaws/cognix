import { resolveOllamaModelForRequest } from "../ollama-models.js";

export interface LlmCompletionResult {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface OllamaChatResponse {
  message: { role: string; content: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

/** @deprecated Use callOllamaChat instead */
export interface OllamaGenerateResponse {
  response: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

// Global promise queue to serialize Ollama calls.
// This prevents concurrent requests from overloading local Ollama CPU instances,
// which is a major cause of timeouts and performance degradation in high-pod clusters.
let ollamaQueue: Promise<any> = Promise.resolve();

/**
 * Call Ollama using the /api/chat endpoint (preferred for conversational use).
 * This is significantly faster than /api/generate for chat-style interactions.
 * Invocations are queued globally to avoid overloading local CPU-based models.
 */
export async function callOllama(
  baseUrl: string,
  system: string,
  prompt: string,
  timeoutMs = 8_000,
  model = "llama3.2:1b",
): Promise<LlmCompletionResult> {
  const url = new URL("/api/chat", baseUrl).toString();

  // Capture the current tail of the queue
  const currentQueueTail = ollamaQueue;

  const resultPromise = (async () => {
    // Wait for the previous request to finish (succeed or fail)
    await currentQueueTail.catch(() => {});

    const { model: resolvedModel, autoSelected } =
      await resolveOllamaModelForRequest(baseUrl, model);
    if (autoSelected) {
      console.log(
        `[callOllama] configured model "${model}" not installed; using "${resolvedModel}"`,
      );
    }

    console.log(
      `[callOllama] [START] baseUrl="${baseUrl}" model="${resolvedModel}" timeoutMs=${timeoutMs}`,
    );

    const messages = [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ];

    const startTime = performance.now();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolvedModel,
        messages,
        stream: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {}
      throw new Error(`Ollama request failed: ${res.status} ${res.statusText} - Body: ${bodyText}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    const elapsed = Math.round(performance.now() - startTime);
    console.log(
      `[callOllama] [SUCCESS] model="${resolvedModel}" latency=${elapsed}ms`,
    );

    const promptTokens = data.prompt_eval_count;
    const completionTokens = data.eval_count;

    return {
      text: data.message.content,
      promptTokens,
      completionTokens,
      totalTokens:
        promptTokens !== undefined && completionTokens !== undefined
          ? promptTokens + completionTokens
          : undefined,
    };
  })();

  // Chain this execution to become the new queue tail
  ollamaQueue = resultPromise;

  return resultPromise;
}
