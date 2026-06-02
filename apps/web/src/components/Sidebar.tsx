"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RezolvLogo } from "@/components/brand/RezolvLogo";
import {
  Bell,
  Box,
  LayoutDashboard,
  Layers,
  Mic,
  MicOff,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
} from "lucide-react";

import {
  useAgentStatus,
  useAlerts,
  useClusters,
  useHeals,
  useLiveTerminal,
  usePods,
} from "@/lib/query";
import { selectVisibleApprovals, useClusterStore } from "@/stores/cluster";
import { useMeshy } from "@/stores/meshy";
import { useMeshyAI } from "@/hooks/useMeshyAI";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/pods", label: "Pods", icon: Box, badgeKey: "pods" as const },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell, badgeKey: "alerts" as const },
  { href: "/dashboard/heals", label: "Heal log", icon: ScrollText, badgeKey: "heals" as const },
  { href: "/dashboard/nodes", label: "Nodes", icon: Server },
  { href: "/dashboard/clusters", label: "Clusters", icon: Layers },
  { href: "/dashboard/rules", label: "Rules", icon: ShieldCheck },
  { href: "/dashboard/meshy", label: "MeshyAI", icon: Mic },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const setCluster = useClusterStore((s) => s.setCluster);
  const pods = useClusterStore((s) => s.pods);
  const alerts = useClusterStore((s) => s.alerts);
  const pendingApprovals = useClusterStore((s) => s.pendingApprovals);
  const { enabled: meshyEnabled, toggle: meshyToggle } = useMeshy();

  usePods();
  useHeals();
  useLiveTerminal();
  useAlerts();
  useMeshyAI(); // Run TTS agent on every page
  const clustersQuery = useClusters();
  const agentQuery = useAgentStatus();

  const issueCount = pods.filter((p) => p.issueType).length;
  const approvalCount = selectVisibleApprovals(pendingApprovals).length;

  const badges = {
    pods: issueCount,
    alerts: alerts.length,
    heals: approvalCount,
  };

  const activeCluster = clustersQuery.data?.find((c) => c.id === activeClusterId);
  const clusterLabel = activeCluster?.name ?? (activeClusterId ? "Cluster" : "No cluster");
  const clusterLive = activeCluster?.health.ok ?? false;
  const ollamaOk = agentQuery.data?.llm.ollama.ok ?? false;

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[200px] flex-col border-r bg-card">
      <div className="border-b px-4 py-5">
        <RezolvLogo variant="sidebar" showTagline />
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV.map(({ href, label, icon: Icon, badgeKey }) => {
          const active = pathname === href;
          const count = badgeKey ? badges[badgeKey] : 0;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </span>
              {count > 0 && (
                <span
                  className={cn(
                    "min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-2xs font-medium",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t p-3">
        <div>
          <label className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Cluster
          </label>
          <select
            className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs"
            value={activeClusterId ?? ""}
            onChange={(e) => setCluster(e.target.value || null)}
          >
            <option value="">Select cluster…</option>
            {clustersQuery.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="mt-1.5 flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                clusterLive ? "bg-emerald-500" : "bg-gray-400",
              )}
            />
            <span className="truncate text-muted-foreground">{clusterLabel}</span>
          </div>
        </div>

        <div className="rounded-md border bg-muted/40 px-2 py-2">
          <p className="text-2xs text-muted-foreground">Ollama</p>
          <div className="mt-1 flex items-center justify-between gap-1">
            <span className="truncate text-xs font-medium">llama3.1:8b</span>
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                ollamaOk ? "bg-emerald-500" : "bg-red-500",
              )}
              title={ollamaOk ? "Connected" : "Unreachable"}
            />
          </div>
        </div>

        {/* MeshyAI status card */}
        <button
          type="button"
          onClick={meshyToggle}
          className={cn(
            "w-full rounded-md border px-2 py-2 text-left transition-all",
            meshyEnabled
              ? "border-violet-400/50 bg-violet-50/80 dark:bg-violet-950/20"
              : "border-border bg-muted/40 hover:bg-muted/60",
          )}
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5">
              {meshyEnabled ? (
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
                </span>
              ) : null}
              {meshyEnabled ? (
                <Mic className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              ) : (
                <MicOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span
                className={cn(
                  "text-xs font-semibold",
                  meshyEnabled
                    ? "text-violet-700 dark:text-violet-300"
                    : "text-muted-foreground",
                )}
              >
                MeshyAI
              </span>
            </div>
            <span
              className={cn(
                "rounded px-1 py-0.5 text-2xs font-medium",
                meshyEnabled
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {meshyEnabled ? "ON" : "OFF"}
            </span>
          </div>
          <p className="mt-1 text-2xs text-muted-foreground">
            {meshyEnabled ? "Announcing heal events" : "AI TTS Agent"}
          </p>
        </button>

        {/* Developer Attribution */}
        <div className="pt-2 text-center border-t border-border/40 mt-1">
          <p className="text-[10px] text-muted-foreground/60 font-medium tracking-wider truncate">
            By Shubham Meshram
          </p>
        </div>
      </div>
    </aside>
  );
}
