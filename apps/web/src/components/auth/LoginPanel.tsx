"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { LoginForm } from "@/components/auth/LoginForm";
import { SetupAdminPanel, type GeneratedAdminCreds } from "@/components/auth/SetupAdminPanel";
import { Button } from "@/components/ui/button";

interface LoginPanelProps {
  needsSetup: boolean;
  googleEnabled: boolean;
  githubEnabled: boolean;
  onGoogleSignIn: () => Promise<void>;
  onGithubSignIn: () => Promise<void>;
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

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={() => void handleCopy()}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
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
      </p>
    </div>
  );
}

export function LoginPanel({
  needsSetup: initialNeedsSetup,
  googleEnabled,
  githubEnabled,
  onGoogleSignIn,
  onGithubSignIn,
}: LoginPanelProps) {
  const [needsSetup, setNeedsSetup] = useState(initialNeedsSetup);
  const [generated, setGenerated] = useState<GeneratedAdminCreds | null>(null);

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

          {(googleEnabled || githubEnabled) && (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or continue with</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          {googleEnabled ? (
            <form action={onGoogleSignIn}>
              <Button type="submit" variant="outline" className="w-full">
                Continue with Google
              </Button>
            </form>
          ) : null}

          {githubEnabled ? (
            <form action={onGithubSignIn}>
              <Button type="submit" variant="outline" className="w-full">
                Continue with GitHub
              </Button>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
