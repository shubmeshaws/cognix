"use client";

import type { HealRecord, PodSummary } from "@/types/api";

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function MetricCards({
  pods,
  heals,
}: {
  pods: PodSummary[];
  heals: HealRecord[];
}) {
  const issues = pods.filter((p) => p.issueType).length;
  const healedToday = heals.filter(
    (h) => h.status === "healed" && isToday(h.createdAt),
  );
  const avgHealMs =
    healedToday.length > 0
      ? Math.round(
          healedToday.reduce((s, h) => s + h.durationMs, 0) / healedToday.length,
        )
      : null;

  const metrics = [
    { label: "Total pods", value: String(pods.length) },
    { label: "Issues detected", value: String(issues) },
    { label: "Healed today", value: String(healedToday.length) },
    {
      label: "Avg heal time",
      value: avgHealMs != null ? formatDuration(avgHealMs) : "—",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((m) => (
        <div key={m.label} className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{m.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{m.value}</p>
        </div>
      ))}
    </div>
  );
}
