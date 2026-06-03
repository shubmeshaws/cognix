"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Mic,
  Settings,
  XCircle,
} from "lucide-react";


import { useClusterStore } from "@/stores/cluster";
import { cn } from "@/lib/utils";

const STATUS_ICON = {
  healed: CheckCircle2,
  failed: XCircle,
  escalated: AlertTriangle,
};
const STATUS_CLASS = {
  healed: "text-emerald-500",
  failed: "text-red-500",
  escalated: "text-amber-500",
};

export default function MeshyAlertsPage() {
  const heals = useClusterStore((s) => s.heals);
  const alerts = useClusterStore((s) => s.alerts);

  const announcedHeals = heals.filter(
    (h) =>
      h.status === "healed" ||
      h.status === "failed" ||
      h.status === "escalated",
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-6 p-6">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Recent announcements</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Heal and alert events Meshy has spoken aloud for this cluster.
              </p>
            </div>
            <Link
              href="/dashboard/settings/voice"
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/30"
            >
              <Settings className="h-4 w-4" />
              Voice alert settings
            </Link>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">What Meshy announces</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              {
                icon: CheckCircle2,
                cls: "text-emerald-500",
                label: "Heal completed",
                desc: "Pod healed successfully for a rule-enabled issue type",
              },
              {
                icon: XCircle,
                cls: "text-red-500",
                label: "Heal failed",
                desc: "The healing action could not be completed",
              },
              {
                icon: AlertTriangle,
                cls: "text-amber-500",
                label: "Escalated",
                desc: "Issue escalated to on-call team after heal failure",
              },
            ].map(({ icon: Icon, cls, label, desc }) => (
              <li key={label} className="flex items-start gap-3">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cls)} />
                <div>
                  <span className="font-medium text-foreground">{label}</span>
                  <span className="ml-1 text-xs">— {desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">
              Recent events ({announcedHeals.length + alerts.length})
            </h3>
          </div>
          {announcedHeals.length === 0 && alerts.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Mic className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                No events yet — they will appear here as they occur.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {[...alerts, ...announcedHeals]
                .sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime(),
                )
                .map((event) => {
                  const isAlert = "message" in event;

                  if (isAlert) {
                    const alert = event as (typeof alerts)[0];
                    return (
                      <li
                        key={alert.id}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {alert.podName}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              · ns: {alert.namespace}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Alert — {alert.message}
                          </p>
                        </div>
                        <time className="shrink-0 text-2xs text-muted-foreground">
                          {new Date(alert.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </li>
                    );
                  }

                  const heal = event as (typeof announcedHeals)[0];
                  const Icon =
                    STATUS_ICON[heal.status as keyof typeof STATUS_ICON] ??
                    CheckCircle2;
                  const cls =
                    STATUS_CLASS[heal.status as keyof typeof STATUS_CLASS] ??
                    "text-muted-foreground";
                  return (
                    <li
                      key={heal.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20"
                    >
                      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cls)} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {heal.podName}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            · ns: {heal.namespace}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {heal.issueType} — {heal.actionTaken} — {heal.status}
                        </p>
                      </div>
                      <time className="shrink-0 text-2xs text-muted-foreground">
                        {new Date(heal.createdAt).toLocaleString(undefined, {
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
