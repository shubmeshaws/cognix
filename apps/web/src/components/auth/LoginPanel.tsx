"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { LoginForm } from "@/components/auth/LoginForm";
import { SetupAdminPanel, type GeneratedAdminCreds } from "@/components/auth/SetupAdminPanel";
import { SsoLoginButtons } from "@/components/auth/SsoLoginButton";
import { Button } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import type { SsoProviderId } from "@/types/api";

interface LoginPanelProps {
  needsSetup: boolean;
  ssoProviders: SsoProviderId[];
  onGoogleSignIn: () => Promise<void>;
  onGithubSignIn: () => Promise<void>;
  onLinkedinSignIn: () => Promise<void>;
}

function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleCopy() {
    setFailed(false);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      return;
    }
    setFailed(true);
    window.setTimeout(() => setFailed(false), 3000);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={() => void handleCopy()}
      title={failed ? "Select the text and press Ctrl+C (Cmd+C on Mac)" : undefined}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : failed ? "Select + Ctrl+C" : label}
    </Button>
  );
}

function formatCredsForCopy(creds: GeneratedAdminCreds): string {
  return [
    `Email: ${creds.email}`,
    `Username: ${creds.username}`,
    `Password: ${creds.password}`,
  ].join("\n");
}

function GeneratedCredsBanner({ creds }: { creds: GeneratedAdminCreds }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-6 text-base">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium text-foreground">Admin credentials — save these now</p>
        <CopyButton text={formatCredsForCopy(creds)} label="Copy all" />
      </div>
      <dl className="space-y-3 font-mono text-sm">
        <div>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="flex items-start justify-between gap-2 break-all text-foreground">
            <span>{creds.email}</span>
            <CopyButton text={creds.email} label="Copy" className="shrink-0" />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Username</dt>
          <dd className="flex items-center justify-between gap-2 text-foreground">
            <span>{creds.username}</span>
            <CopyButton text={creds.username} label="Copy" className="shrink-0" />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Password</dt>
          <dd className="flex items-start justify-between gap-2 break-all text-foreground">
            <span>{creds.password}</span>
            <CopyButton text={creds.password} label="Copy" className="shrink-0" />
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-muted-foreground">
        Sign in below. You will be asked to set a new password on first login.
        If Copy does not work over HTTP, select the password and press{" "}
        <kbd className="rounded border px-1 text-xs">Ctrl+C</kbd>.
      </p>
    </div>
  );
}

export function LoginPanel({
  needsSetup: initialNeedsSetup,
  ssoProviders,
  onGoogleSignIn,
  onGithubSignIn,
  onLinkedinSignIn,
}: LoginPanelProps) {
  const [needsSetup, setNeedsSetup] = useState(initialNeedsSetup);
  const [generated, setGenerated] = useState<GeneratedAdminCreds | null>(null);

  const signInHandlers: Record<SsoProviderId, () => Promise<void>> = {
    google: onGoogleSignIn,
    github: onGithubSignIn,
    linkedin: onLinkedinSignIn,
  };

  const visibleProviders = ssoProviders.filter(
    (id): id is SsoProviderId =>
      id === "google" || id === "github" || id === "linkedin",
  );

  return (
    <div className="flex flex-col gap-6">
      {needsSetup ? (
        <SetupAdminPanel
          onGenerated={(creds) => {
            setGenerated(creds);
            setNeedsSetup(false);
          }}
        />
      ) : null}

      {generated ? <GeneratedCredsBanner creds={generated} /> : null}

      {!needsSetup ? (
        <>
          <LoginForm
            initialEmailOrUsername={generated?.username ?? generated?.email}
            initialPassword={generated?.password}
          />

          <SsoLoginButtons
            providers={visibleProviders}
            signInHandlers={signInHandlers}
          />
        </>
      ) : null}
    </div>
  );
}
