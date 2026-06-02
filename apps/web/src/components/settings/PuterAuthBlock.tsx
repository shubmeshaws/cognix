"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
import { DEFAULT_PUTER_MODEL } from "@kubehealer/shared";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settings";

const PUTER_SCRIPT = "https://js.puter.com/v2/";

function extractPuterChatText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const r = response as {
    message?: { content?: string | unknown };
    text?: string;
  };
  const content = r.message?.content;
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && "toString" in content) {
    return String(content);
  }
  if (typeof r.text === "string") return r.text;
  return "";
}

export function PuterAuthBlock({
  onTest,
  testing,
}: {
  onTest: () => void;
  testing: boolean;
}) {
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [browserTestMsg, setBrowserTestMsg] = useState<string | null>(null);

  const puterAuthToken = useSettingsStore((s) => s.puterAuthToken);
  const puterModel = useSettingsStore((s) => s.puterModel);
  const puterTokenConfiguredOnAgent = useSettingsStore(
    (s) => s.puterTokenConfiguredOnAgent,
  );
  const setPuterAuthToken = useSettingsStore((s) => s.setPuterAuthToken);
  const setPuterModel = useSettingsStore((s) => s.setPuterModel);

  const refreshSession = useCallback(async () => {
    const puter = window.puter;
    if (!puter?.auth.isSignedIn()) {
      setUsername(null);
      return;
    }
    try {
      const user = await puter.auth.getUser();
      setUsername(user.username);
    } catch {
      setUsername(null);
    }
  }, []);

  useEffect(() => {
    if (scriptReady) void refreshSession();
  }, [scriptReady, refreshSession]);

  const handleSignIn = async () => {
    const puter = window.puter;
    if (!puter) {
      setError("Puter.js is still loading. Try again in a moment.");
      return;
    }

    setBusy(true);
    setError(null);
    setBrowserTestMsg(null);

    try {
      const res = await puter.auth.signIn();
      if (!res.success || !res.token) {
        setError(res.error ?? res.msg ?? "Puter sign-in did not return a token.");
        return;
      }
      setPuterAuthToken(res.token);
      setUsername(res.username ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Puter sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    const puter = window.puter;
    setBusy(true);
    setError(null);
    setBrowserTestMsg(null);
    try {
      if (puter?.auth.isSignedIn()) {
        await puter.auth.signOut();
      }
      setPuterAuthToken("");
      setUsername(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-out failed");
    } finally {
      setBusy(false);
    }
  };

  const handleBrowserTest = async () => {
    const puter = window.puter;
    if (!puter?.ai?.chat) {
      setBrowserTestMsg("Puter.js AI is not loaded yet.");
      return;
    }
    if (!puter.auth.isSignedIn()) {
      setBrowserTestMsg("Sign in first.");
      return;
    }

    const model = puterModel.trim() || DEFAULT_PUTER_MODEL;
    setBusy(true);
    setBrowserTestMsg(null);
    try {
      const response = await puter.ai.chat("Reply with exactly: OK", { model });
      const text = extractPuterChatText(response).trim();
      if (!text) {
        setBrowserTestMsg("Puter responded but returned empty text.");
        return;
      }
      setBrowserTestMsg(`Browser OK (${model}): ${text.slice(0, 80)}`);
    } catch (err) {
      setBrowserTestMsg(
        err instanceof Error ? err.message : "Browser Puter.ai test failed",
      );
    } finally {
      setBusy(false);
    }
  };

  const signedIn = Boolean(puterAuthToken) || Boolean(username);
  const fieldClass =
    "w-full rounded-md border bg-background px-3 py-2 text-sm";

  return (
    <>
      <Script
        src={PUTER_SCRIPT}
        strategy="lazyOnload"
        onReady={() => setScriptReady(true)}
      />

      <p className="text-xs text-muted-foreground">
        Sign in with Puter (Google, etc.). Default model is{" "}
        <code className="rounded bg-muted px-1">{DEFAULT_PUTER_MODEL}</code> per
        Puter docs. Other examples:{" "}
        <code className="rounded bg-muted px-1">gpt-5.4-nano</code>,{" "}
        <code className="rounded bg-muted px-1">openai/gpt-5.2-chat</code>.
        After sign-in, use <strong>Test in browser</strong>, then{" "}
        <strong>Test via agent</strong>, then <strong>Apply to agent</strong>.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {!signedIn ? (
          <Button
            type="button"
            size="sm"
            disabled={!scriptReady || busy}
            onClick={() => void handleSignIn()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in with Puter"
            )}
          </Button>
        ) : (
          <>
            <span className="text-sm text-emerald-700">
              Signed in{username ? ` as ${username}` : ""}
              {puterTokenConfiguredOnAgent ? " · synced to agent" : ""}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void handleSignIn()}
            >
              Refresh session
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void handleSignOut()}
            >
              Sign out
            </Button>
          </>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <label className="block space-y-1 text-xs">
        <span className="font-medium">Model</span>
        <input
          className={fieldClass}
          value={puterModel}
          onChange={(e) => setPuterModel(e.target.value)}
          placeholder={DEFAULT_PUTER_MODEL}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !signedIn}
          onClick={() => void handleBrowserTest()}
        >
          Test in browser
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={testing || !puterAuthToken}
          onClick={onTest}
        >
          Test via agent
        </Button>
      </div>

      {browserTestMsg && (
        <p className="text-xs text-muted-foreground">{browserTestMsg}</p>
      )}
    </>
  );
}
