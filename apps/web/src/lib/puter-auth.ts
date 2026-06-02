/** Exchange Puter.js sign-in session token for an app token (browser only). */
export async function exchangePuterAppTokenInBrowser(
  sessionToken: string,
  origin: string,
): Promise<string> {
  const res = await fetch("https://api.puter.com/auth/get-user-app-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
      Origin: origin,
      Referer: `${origin}/`,
    },
    body: JSON.stringify({ origin }),
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

/** Normalize localhost vs 127.0.0.1 for consistent Puter origin binding. */
export function normalizePuterAppOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
    }
    return url.origin;
  } catch {
    return origin;
  }
}
