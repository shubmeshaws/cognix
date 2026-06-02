import { DEFAULT_PUTER_MODEL } from "@kubehealer/shared";

import { callOpenAiCompat } from "./openai-compat.js";
import type { LlmCompletionResult } from "./ollama.js";
import { callPuterDriver } from "./puter-driver.js";

export const PUTER_OPENAI_BASE = "https://api.puter.com/puterai/openai/v1";

function isUserSessionOnlyError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("user sessions") || msg.includes("only available to user");
}

/**
 * Puter LLM call: try OpenAI-compatible puterai (dashboard tokens), then
 * drivers/call with session token exchange (Puter.js sign-in tokens).
 */
export async function callPuter(
  authToken: string,
  system: string,
  prompt: string,
  timeoutMs = 30_000,
  model = DEFAULT_PUTER_MODEL,
  appOrigin = "http://localhost:3000",
): Promise<LlmCompletionResult> {
  try {
    return await callOpenAiCompat(
      PUTER_OPENAI_BASE,
      authToken,
      system,
      prompt,
      timeoutMs,
      model,
      { jsonMode: false, origin: appOrigin },
    );
  } catch (err) {
    if (!isUserSessionOnlyError(err)) {
      throw err;
    }
  }

  return callPuterDriver(
    authToken,
    system,
    prompt,
    model,
    appOrigin,
    timeoutMs,
  );
}
