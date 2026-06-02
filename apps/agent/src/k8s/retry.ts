const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 100;

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;

  const code =
    "code" in err && typeof err.code === "string" ? err.code : undefined;
  if (
    code &&
    ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(
      code,
    )
  ) {
    return true;
  }

  const name = "name" in err && typeof err.name === "string" ? err.name : "";
  if (name === "FetchError" || name === "AbortError") return true;

  if ("cause" in err && err.cause) return isNetworkError(err.cause);

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isNetworkError(err) || attempt === MAX_ATTEMPTS) {
        throw err;
      }
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}
