"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  Info,
  ShieldAlert,
  XCircle,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";


import { useAlerts, useHeals } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";
import { cn } from "@/lib/utils";
import type { AlertEvent, HealRecord } from "@/types/api";
import { formatHealActionLabel } from "@/lib/heal-labels";

/** Unified alert entry that normalises both sources */
type UnifiedAlert = {
  id: string;
  kind: "alert" | "heal";
  severity: "critical" | "warning" | "info" | "success";
  title: string;
  description: string;
  podName: string;
  namespace: string;
  createdAt: string;

  // Custom alert properties
  notifiedSlack?: boolean;
  notifiedPagerduty?: boolean;

  // Custom heal properties
  actionTaken?: string;
  durationMs?: number;
  approvedBy?: string | null;
  needsApproval?: boolean;
  memoryPatched?: boolean;
  rolloutComplete?: boolean;
  issueType?: string;
  status?: string;
};

function healRecordToAlert(h: HealRecord): UnifiedAlert {
  const sevMap: Record<string, UnifiedAlert["severity"]> = {
    healed: "success",
    failed: "critical",
    escalated: "warning",
    skipped: "info",
    pending: "info",
  };
  const titleMap: Record<string, string> = {
    healed: "Heal completed",
    failed: "Heal failed",
    escalated: "Escalated to on-call",
    skipped: "Heal skipped",
    pending: "Heal pending",
  };
  const action = formatHealActionLabel(h.actionTaken);
  return {
    id: `heal-${h.id}`,
    kind: "heal",
    severity: sevMap[h.status] ?? "info",
    title: titleMap[h.status] ?? "Heal event",
    description: `${h.issueType} — ${action}`,
    podName: h.podName,
    namespace: h.namespace,
    createdAt: h.createdAt,

    // Custom fields
    actionTaken: h.actionTaken,
    durationMs: h.durationMs,
    approvedBy: h.approvedBy,
    needsApproval: h.needsApproval,
    memoryPatched: h.memoryPatched,
    rolloutComplete: h.rolloutComplete,
    issueType: h.issueType,
    status: h.status,
  };
}

function alertEventToUnified(a: AlertEvent): UnifiedAlert {
  const sev = (a.severity?.toLowerCase() ?? "warning") as UnifiedAlert["severity"];
  const normalised: UnifiedAlert["severity"] =
    sev === "critical" || sev === "warning" || sev === "success" || sev === "info"
      ? sev
      : "warning";
  return {
    id: `alert-${a.id}`,
    kind: "alert",
    severity: normalised,
    title: "Cluster alert",
    description: a.message,
    podName: a.podName,
    namespace: a.namespace,
    createdAt: a.createdAt,

    // Custom fields
    notifiedSlack: a.notifiedSlack,
    notifiedPagerduty: a.notifiedPagerduty,
  };
}

const SEV_ICON = {
  critical: XCircle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
};

const SEV_ICON_CLASS = {
  critical: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
  success: "text-emerald-500",
};

const SEV_BADGE_CLASS = {
  critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

const SEV_ROW_CLASS = {
  critical:
    "border-l-2 border-l-red-400 dark:border-l-red-600 bg-red-50/30 dark:bg-red-950/10",
  warning:
    "border-l-2 border-l-amber-400 dark:border-l-amber-600 bg-amber-50/30 dark:bg-amber-950/10",
  info: "border-l-2 border-l-blue-400 dark:border-l-blue-600",
  success:
    "border-l-2 border-l-emerald-400 dark:border-l-emerald-600 bg-emerald-50/20 dark:bg-emerald-950/10",
};

type FilterKind = "all" | "alert" | "heal";
type FilterSev = "all" | "critical" | "warning" | "info" | "success";

export default function AlertsPage() {
  const alerts = useClusterStore((s) => s.alerts);
  const heals = useClusterStore((s) => s.heals);
  const activeClusterId = useClusterStore((s) => s.activeClusterId);

  // Keep data fresh
  useAlerts();
  useHeals();

  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [filterSev, setFilterSev] = useState<FilterSev>("all");

  const unified = useMemo<UnifiedAlert[]>(() => {
    const fromHeals = heals
      .filter((h) => h.status !== "pending")
      .map(healRecordToAlert);
    const fromAlerts = alerts.map(alertEventToUnified);
    return [...fromHeals, ...fromAlerts].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [heals, alerts]);

  const filtered = useMemo(
    () =>
      unified.filter((u) => {
        if (filterKind !== "all" && u.kind !== filterKind) return false;
        if (filterSev !== "all" && u.severity !== filterSev) return false;
        return true;
      }),
    [unified, filterKind, filterSev],
  );

  const counts = useMemo(
    () => ({
      critical: unified.filter((u) => u.severity === "critical").length,
      warning: unified.filter((u) => u.severity === "warning").length,
      success: unified.filter((u) => u.severity === "success").length,
      info: unified.filter((u) => u.severity === "info").length,
    }),
    [unified],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-6 p-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              { label: "Critical", sev: "critical", icon: XCircle, count: counts.critical },
              { label: "Warning", sev: "warning", icon: AlertTriangle, count: counts.warning },
              { label: "Healed", sev: "success", icon: CheckCircle2, count: counts.success },
              { label: "Info", sev: "info", icon: Info, count: counts.info },
            ] as const
          ).map(({ label, sev, icon: Icon, count }) => (
            <button
              key={sev}
              type="button"
              onClick={() => setFilterSev(filterSev === sev ? "all" : sev)}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-4 text-left transition-all hover:shadow-sm",
                filterSev === sev
                  ? SEV_BADGE_CLASS[sev] + " ring-2 ring-offset-1"
                  : "bg-card hover:bg-muted/40",
              )}
            >
              <div className="flex items-center justify-between">
                <Icon className={cn("h-4 w-4", SEV_ICON_CLASS[sev])} />
                <span className="text-2xl font-bold tabular-nums">{count}</span>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {label}
              </span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Type:</span>
          {(["all", "heal", "alert"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilterKind(k)}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filterKind === k
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {k === "heal" && <Zap className="h-3 w-3" />}
              {k === "alert" && <ShieldAlert className="h-3 w-3" />}
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </button>
          ))}

          <span className="ml-2 text-xs text-muted-foreground">Severity:</span>
          {(["all", "critical", "warning", "success", "info"] as const).map(
            (s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterSev(s === filterSev ? "all" : s)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  filterSev === s
                    ? s === "all"
                      ? "bg-primary text-primary-foreground"
                      : SEV_BADGE_CLASS[s]
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ),
          )}

          {(filterKind !== "all" || filterSev !== "all") && (
            <button
              type="button"
              onClick={() => {
                setFilterKind("all");
                setFilterSev("all");
              }}
              className="ml-auto text-xs text-muted-foreground underline hover:text-foreground"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Alerts list */}
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="border-b px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {filtered.length} event{filtered.length !== 1 ? "s" : ""}
              {filterKind !== "all" || filterSev !== "all" ? " (filtered)" : ""}
            </h2>
            {!activeClusterId && (
              <span className="text-xs text-muted-foreground">
                Connect a cluster to see live events
              </span>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">
                {unified.length === 0
                  ? "No events yet — heal activity will appear here"
                  : "No events match the current filters"}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((alert) => {
                const Icon = SEV_ICON[alert.severity];
                return (
                  <li
                    key={alert.id}
                    className={cn(
                      "flex gap-3 px-4 py-3 transition-colors hover:bg-muted/30",
                      SEV_ROW_CLASS[alert.severity],
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        SEV_ICON_CLASS[alert.severity],
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{alert.title}</p>
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-2xs font-medium",
                            SEV_BADGE_CLASS[alert.severity],
                          )}
                        >
                          {alert.severity}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                          {alert.kind === "heal" ? "heal" : "alert"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {alert.description}
                      </p>

                      {/* Unified Alert / Heal Rich Details */}
                      {alert.kind === "alert" && (alert.notifiedSlack || alert.notifiedPagerduty) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-3xs font-semibold">
                          <span className="uppercase tracking-wider text-muted-foreground/75 font-bold mr-0.5">Notified:</span>
                          <span className={cn(
                            "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 border text-2xs font-semibold tracking-wide transition-all",
                            alert.notifiedSlack
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40"
                              : "bg-muted/40 text-muted-foreground/50 border-transparent"
                          )}>
                            💬 Slack
                          </span>
                          <span className={cn(
                            "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 border text-2xs font-semibold tracking-wide transition-all",
                            alert.notifiedPagerduty
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40"
                              : "bg-muted/40 text-muted-foreground/50 border-transparent"
                          )}>
                            📟 PagerDuty
                          </span>
                        </div>
                      )}

                      {alert.kind === "heal" && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-3xs font-semibold">
                          
                          {/* Duration Badge */}
                          {alert.durationMs !== undefined && alert.durationMs > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-muted/60 border text-muted-foreground font-semibold px-1.5 py-0.5">
                              ⏱️ {(alert.durationMs / 1000).toFixed(1)}s
                            </span>
                          )}

                          {/* Approval Badge */}
                          {alert.approvedBy ? (
                            <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/60 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/40 px-1.5 py-0.5">
                              👤 Approved by: {alert.approvedBy}
                            </span>
                          ) : alert.status === "healed" ? (
                            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/40 px-1.5 py-0.5">
                              🤖 Auto-healed
                            </span>
                          ) : alert.status === "pending" ? (
                            <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/40 px-1.5 py-0.5 animate-pulse">
                              ⏳ Needs approval
                            </span>
                          ) : null}

                          {/* Diagnostic System Tags */}
                          {alert.rolloutComplete && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200/60 dark:bg-violet-950/20 dark:text-violet-400 dark:border-violet-900/40 px-1.5 py-0.5">
                              ⚡ Rollout complete
                            </span>
                          )}

                          {alert.memoryPatched && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/40 px-1.5 py-0.5">
                              🧠 Limit patched
                            </span>
                          )}

                        </div>
                      )}
                      <p className="mt-0.5 text-2xs text-muted-foreground">
                        <span className="font-mono font-medium text-foreground/70">
                          {alert.podName}
                        </span>
                        <span className="mx-1 text-muted-foreground/50">·</span>
                        ns:{" "}
                        <span className="font-medium">{alert.namespace}</span>
                      </p>
                    </div>
                    <time className="shrink-0 text-2xs text-muted-foreground mt-0.5">
                      {new Date(alert.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
