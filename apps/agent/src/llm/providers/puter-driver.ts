import type { LlmCompletionResult } from "./ollama.js";

const PUTER_DRIVERS_CALL = "https://api.puter.com/drivers/call";
const PUTER_APP_TOKEN_URL = "https://api.puter.com/auth/get-user-app-token";

interface PuterDriverResponse {
  success?: boolean;
  result?: {
    message?: { content?: string };
    finish_reason?: string;
    usage?: Array<{ type: string; amount: number }>;
  };
  error?: { message?: string; delegate?: string };
}

/** Exchange Puter sign-in session JWT for an app token (drivers/call). */
export async function exchangePuterAppToken(
  sessionToken: string,
  origin: string,
): Promise<string> {
  const res = await fetch(PUTER_APP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
      Origin: origin,
      Referer: `${origin}/`,
    },
    body: JSON.stringify({ origin }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Puter token exchange failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as { token?: string };
  const appToken = data.token?.trim();
  if (!appToken) {
    throw new Error("Puter token exchange returned no app token");
  }
  return appToken;
}

function usageTotals(
  usage?: Array<{ type: string; amount: number }>,
): Pick<LlmCompletionResult, "promptTokens" | "completionTokens" | "totalTokens"> {
  const items = usage ?? [];
  let promptTokens = 0;
  let completionTokens = 0;
  for (const item of items) {
    if (item.type === "prompt") promptTokens += item.amount;
    if (item.type === "completion") completionTokens += item.amount;
  }
  const totalTokens = promptTokens + completionTokens;
  return {
    promptTokens: promptTokens || undefined,
    completionTokens: completionTokens || undefined,
    totalTokens: totalTokens || undefined,
  };
}

/** Server-side Puter chat via drivers/call (sign-in session tokens). */
export async function callPuterDriver(
  sessionToken: string,
  system: string,
  prompt: string,
  model: string,
  origin: string,
  timeoutMs = 30_000,
): Promise<LlmCompletionResult> {
  const appToken = await exchangePuterAppToken(sessionToken, origin);

  const body = {
    interface: "puter-chat-completion",
    driver: "openai-completion",
    test_mode: false,
    method: "complete",
    args: {
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      model,
      stream: false,
    },
  };

  const res = await fetch(PUTER_DRIVERS_CALL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${appToken}`,
      Origin: origin,
      Referer: `${origin}/`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Puter drivers/call failed: ${res.status} — ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as PuterDriverResponse;
  if (data.success === false) {
    const msg =
      data.error?.message ??
      data.error?.delegate ??
      "Puter drivers/call returned success=false";
    throw new Error(msg);
  }

  const text = data.result?.message?.content;
  if (!text) {
    throw new Error("Puter drivers/call returned empty completion");
  }

  return {
    text,
    ...usageTotals(data.result?.usage),
  };
}
