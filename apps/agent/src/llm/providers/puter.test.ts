import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("callPuter user-session fallback", () => {
  it("falls back through openai, app token, and exchange paths", async () => {
    const { callPuter } = await import("./puter.js");
    const originalFetch = globalThis.fetch;

    let callCount = 0;
    globalThis.fetch = async (input, init) => {
      callCount += 1;
      const url = String(input);
      if (url.includes("puterai/openai")) {
        return new Response(
          JSON.stringify({
            error: "This endpoint is only available to user sessions",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("drivers/call")) {
        const auth = String(
          (init?.headers as Record<string, string> | undefined)?.Authorization ??
            "",
        );
        if (auth.includes("app-tok")) {
          return new Response(
            JSON.stringify({
              success: true,
              result: { message: { content: "OK" }, usage: [] },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "invalid token" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("get-user-app-token")) {
        return new Response(JSON.stringify({ token: "app-tok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    };

    try {
      const result = await callPuter(
        "session-tok",
        "test",
        "hi",
        5_000,
        "gpt-5-nano",
        "http://localhost:3000",
      );
      assert.equal(result.text, "OK");
      assert.ok(callCount >= 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
