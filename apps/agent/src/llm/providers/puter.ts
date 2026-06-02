import { DEFAULT_PUTER_MODEL } from "@kubehealer/shared";

import { callOpenAiCompat } from "./openai-compat.js";
import type { LlmCompletionResult } from "./ollama.js";
import {
  callPuterDriver,
  callPuterDriverWithAppToken,
} from "./puter-driver.js";

export const PUTER_OPENAI_BASE = "https://api.puter.com/puterai/openai/v1";

function isUserSessionOnlyError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("user sessions") || msg.includes("only available to user");
}

function isPuterAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    isUserSessionOnlyError(err) ||
    msg.includes("token exchange failed") ||
    msg.includes("token_auth_failed") ||
    msg.includes("401") ||
    msg.includes("403")
  );
}

/**
 * Puter LLM call:
 * 1. OpenAI-compatible puterai (dashboard auth tokens)
 * 2. drivers/call with app token (browser-exchanged Puter.js tokens)
 * 3. Session token exchange + drivers/call (legacy fallback)
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
    if (!isUserSessionOnlyError(err) && !isPuterAuthError(err)) {
      throw err;
    }
  }

  try {
    return await callPuterDriverWithAppToken(
      authToken,
      system,
      prompt,
      model,
      appOrigin,
      timeoutMs,
    );
  } catch (err) {
    if (!isPuterAuthError(err)) {
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
