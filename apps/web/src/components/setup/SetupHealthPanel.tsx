"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Terminal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAgentToken } from "@/hooks/useAgentToken";
import {
  countRequiredChecks,
  mergeSetupChecks,
  SETUP_CHECK_CATALOG,
} from "@/lib/setup-checks";
import { useSetupHealth } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";
import { cn } from "@/lib/utils";
import type { SetupHealthCheck } from "@/types/api";

function StatusIcon({ ok, loading }: { ok: boolean; loading?: boolean }) {
  if (loading) {
    return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />;
  }
  if (ok) {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />;
  }
  return <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />;
}

function InstallCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mt-3 rounded-lg border bg-muted/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Terminal className="h-3.5 w-3.5" />
        Install / start
      </div>
      <div className="flex items-start gap-2">
        <code className="flex-1 break-all rounded-md bg-background px-2 py-1.5 font-mono text-xs">
          {command}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function SetupCheckRow({
  check,
  loading,
}: {
  check: SetupHealthCheck;
  loading?: boolean;
}) {
  const def = SETUP_CHECK_CATALOG[check.id];
  if (!def) return null;

  const showActions = !check.ok && !loading && check.meta?.skipped !== true;
  const statusLabel = loading
    ? "Checking…"
    : check.ok
      ? "Ready"
      : def.optional || check.meta?.skipped === true
        ? "Not configured"
        : "Needs setup";

  return (
    <article className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <StatusIcon ok={check.ok} loading={loading} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{def.title}</h3>
            {def.optional || check.meta?.skipped === true ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">
                Optional
              </span>
            ) : null}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-2xs font-semibold",
                check.ok
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : def.optional
                    ? "bg-muted text-muted-foreground"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
              )}
            >
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{def.description}</p>
          <p className="mt-2 text-sm">{check.detail}</p>

          {(() => {
            const showInstall = showActions && Boolean(def.installCommand);
            const showSetup = showActions && Boolean(def.setupHref);
            return (
              <>
                {showInstall && def.installCommand ? (
                  <InstallCommand command={def.installCommand} />
                ) : null}

                {showSetup && def.setupHref ? (
                  <div className="mt-3">
                    <Button
                      asChild
                      size="sm"
                      variant={showInstall ? "outline" : "default"}
                    >
                      <Link href={def.setupHref}>
                        {def.setupLabel ?? "Set up"}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </>
            );
          })()}
        </div>
      </div>
    </article>
  );
}

export function SetupHealthPanel() {
  const token = useAgentToken();
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const wsConnected = useClusterStore((s) => s.wsConnected);
  const setupQuery = useSetupHealth();

  const clientChecks = useMemo<SetupHealthCheck[]>(() => {
    const checks: SetupHealthCheck[] = [
      {
        id: "auth",
        ok: Boolean(token),
        detail: token
          ? "Signed in — agent API calls are authorized"
          : "Not signed in — refresh or open the login page",
      },
    ];

    if (activeClusterId) {
      checks.push({
        id: "websocket",
        ok: wsConnected,
        detail: wsConnected
          ? "Live updates connected for the selected cluster"
          : "Not connected — select a cluster and wait a few seconds, or refresh",
      });
    } else {
      checks.push({
        id: "websocket",
        ok: false,
        detail: "Select a cluster in the sidebar to connect the live stream",
      });
    }

    return checks;
  }, [token, activeClusterId, wsConnected]);

  const checks = useMemo(
    () => mergeSetupChecks(setupQuery.data?.checks, clientChecks),
    [setupQuery.data?.checks, clientChecks],
  );

  const { ready, total } = countRequiredChecks(checks);
  const allReady = ready === total && total > 0;
  const loading = setupQuery.isLoading || setupQuery.isFetching;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              Setup status
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {allReady
                ? "Everything required is connected"
                : `${ready} of ${total} required checks passing`}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Verify each dependency before using healing, Meshy, and live dashboards.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || !token}
            onClick={() => void setupQuery.refetch()}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Re-run checks
          </Button>
        </div>

        {!token ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            Sign in to run agent health checks.
          </p>
        ) : null}

        {setupQuery.isError ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            Could not reach the agent. Start it with{" "}
            <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">
              pnpm dev:agent
            </code>{" "}
            or{" "}
            <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">
              docker compose up agent
            </code>
            .
          </p>
        ) : null}
      </section>

      <div className="space-y-4">
        {checks.map((check) => (
          <SetupCheckRow
            key={check.id}
            check={check}
            loading={loading && check.id !== "auth" && check.id !== "websocket"}
          />
        ))}

        {loading && checks.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-sm text-muted-foreground">
            <CircleDashed className="h-4 w-4 animate-spin" />
            Running health checks…
          </div>
        ) : null}
      </div>
    </div>
  );
}
