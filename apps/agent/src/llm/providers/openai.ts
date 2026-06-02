import { callOpenAiCompat } from "./openai-compat.js";
import type { LlmCompletionResult } from "./ollama.js";

const OPENAI_BASE = "https://api.openai.com/v1";

export async function callOpenAi(
  apiKey: string,
  system: string,
  prompt: string,
  timeoutMs = 30_000,
  model = "gpt-4o-mini",
): Promise<LlmCompletionResult> {
  return callOpenAiCompat(
    OPENAI_BASE,
    apiKey,
    system,
    prompt,
    timeoutMs,
    model,
  );
}
