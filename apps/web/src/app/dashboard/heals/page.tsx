"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  Search,
  Filter,
  AlertTriangle,
  Zap,
  Clock,
} from "lucide-react";

import { Topbar } from "@/components/dashboard/Topbar";
import { PodActionBadge } from "@/components/dashboard/PodActionBadge";
import { useHeals } from "@/lib/query";
import { useClusterStore } from "@/stores/cluster";
import { cn } from "@/lib/utils";

export default function HealLogPage() {
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const heals = useClusterStore((s) => s.heals);
  useHeals();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");

  const getBadgeVariant = (status: string) => {
    switch (status) {
      case "pending":
        return "healing";
      case "healed":
        return "healed";
      case "failed":
        return "failed";
      case "skipped":
        return "skipped";
      case "escalated":
        return "approval";
      default:
        return "neutral";
    }
  };

  const filteredHeals = useMemo(() => {
    return heals.filter((h) => {
      // Search filter
      const matchesSearch =
        searchTerm === "" ||
        h.podName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.issueType.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.actionTaken.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (h.namespace && h.namespace.toLowerCase().includes(searchTerm.toLowerCase()));

      // Status filter
      let matchesStatus = true;
      if (selectedStatus !== "All") {
        matchesStatus = h.status === selectedStatus;
      }

      return matchesSearch && matchesStatus;
    });
  }, [heals, searchTerm, selectedStatus]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Topbar title="Heal log" />

      <div className="flex-1 p-5 md:p-6 space-y-6">
        {/* Header Title Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Auto-Remediation Logs</h2>
            <p className="text-sm text-muted-foreground">
              Monitor real-time execution, approvals, and outcomes of automated healing recipes.
            </p>
          </div>
        </div>

        {/* Global Cluster Selection Check */}
        {!activeClusterId ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 dark:bg-amber-950/10 dark:border-amber-900/30">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-950 dark:text-amber-300">No active cluster selected</h4>
                <p className="text-sm text-amber-800/80 dark:text-amber-400/80 mt-1">
                  Please select a connected cluster from the sidebar to view auto-healing activity logs.
                </p>
              </div>
            </div>
          </div>
        ) : heals.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <Zap className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
            <h3 className="text-sm font-semibold text-foreground">No heal events yet</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
              Rezolv will automatically detect cluster issues and execute auto-healing recipes in real time when anomalies trigger.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filters Bar Card */}
            <div className="rounded-xl border bg-card p-4 shadow-2xs space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/75" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by pod, namespace, action, or issue..."
                    className="w-full pl-9 pr-4 py-2 border rounded-lg bg-background text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/25 transition-all"
                  />
                </div>

                {/* Status Pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-3xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1 mr-1">
                    <Filter className="h-3 w-3" /> Status:
                  </span>
                  {(["All", "healed", "pending", "failed", "escalated", "skipped"] as const).map((status) => {
                    const label =
                      status === "All"
                        ? "All"
                        : status === "pending"
                        ? "Healing"
                        : status.charAt(0).toUpperCase() + status.slice(1);
                    const active = selectedStatus === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setSelectedStatus(status)}
                        className={cn(
                          "px-2.5 py-1 rounded-full border text-2xs font-semibold tracking-wide transition-all",
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground hover:bg-muted/40 border-border"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

              </div>
            </div>

            {/* List Results */}
            {filteredHeals.length === 0 ? (
              <div className="rounded-xl border bg-card p-12 text-center shadow-2xs">
                <Filter className="mx-auto h-8 w-8 text-muted-foreground/45 mb-3" />
                <h3 className="text-sm font-semibold text-foreground">No matching logs found</h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
                  Try adjusting or clearing your filters to see older auto-heal records.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedStatus("All");
                  }}
                  className="mt-3 text-xs text-indigo-600 hover:text-indigo-500 font-medium underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="rounded-xl border bg-card shadow-2xs overflow-hidden">
                <ul className="divide-y divide-border">
                  {filteredHeals.map((h) => {
                    const durationText =
                      h.durationMs > 0 ? `${(h.durationMs / 1000).toFixed(1)}s` : null;
                    return (
                      <li key={h.id} className="transition-all hover:bg-muted/20">
                        <Link
                          href={`/dashboard/heals/${h.id}`}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3"
                        >
                          
                          {/* Event Summary Left */}
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground">
                              <Zap className="h-4 w-4 text-indigo-500" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-foreground text-sm truncate">
                                  {h.podName}
                                </span>
                                <span className="rounded bg-muted/60 border px-1.5 py-0.5 text-3xs font-semibold text-muted-foreground">
                                  ns: {h.namespace}
                                </span>
                              </div>
                              
                              <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                                <span className="font-medium text-destructive dark:text-red-400">
                                  {h.issueType}
                                </span>
                                <span className="text-muted-foreground/30">•</span>
                                <span className="truncate">
                                  {h.actionTaken}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Event Status Right */}
                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-0 pt-2 sm:pt-0 border-border/40">
                            <div className="flex items-center gap-2">
                              {durationText && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-3xs font-semibold text-muted-foreground border">
                                  <Clock className="h-3 w-3 text-muted-foreground/80" />
                                  {durationText}
                                </span>
                              )}
                              <PodActionBadge
                                variant={getBadgeVariant(h.status)}
                                label={h.status === "pending" ? "Healing" : undefined}
                              />
                            </div>

                            <time className="text-3xs text-muted-foreground font-mono">
                              {new Date(h.createdAt).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </time>
                          </div>

                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

