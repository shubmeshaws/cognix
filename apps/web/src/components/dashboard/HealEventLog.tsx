"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { Panel } from "@/components/dashboard/Panel";
import type { HealRecord, HealStatus } from "@/types/api";
import { cn } from "@/lib/utils";

const VISIBLE_EVENTS = 5;
/** ~5 list items (4.5rem each) — fixed viewport, scroll when more events */
const EVENT_LIST_VIEWPORT_CLASS = "h-[calc(4.5rem*5)] max-h-[calc(4.5rem*5)] shrink-0";

const ICONS: Record<HealStatus, typeof CheckCircle2> = {
  healed: CheckCircle2,
  failed: XCircle,
  escalated: AlertTriangle,
  pending: Clock,
  skipped: ShieldAlert,
};

const ICON_CLASS: Record<HealStatus, string> = {
  healed: "text-emerald-500",
  failed: "text-red-500",
  escalated: "text-amber-500",
  pending: "text-blue-500",
  skipped: "text-muted-foreground",
};

export function HealEventLog({ heals }: { heals: HealRecord[] }) {
  const events = [...heals].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const hasMore = events.length > VISIBLE_EVENTS;

  return (
    <Panel title="Heal event log" viewAllPrompt="Show complete heal event history">
      <div
        className={`panel-scroll overflow-x-hidden overflow-y-scroll ${EVENT_LIST_VIEWPORT_CLASS}`}
      >
        <ul className="divide-y">
          {events.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              No heal events yet
            </li>
          ) : (
            events.map((h) => {
              const Icon = ICONS[h.status];
              return (
                <li key={h.id} className="flex gap-3 px-4 py-3">
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      ICON_CLASS[h.status],
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {h.podName} · {h.issueType}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {h.actionTaken} — {h.status}
                      {h.durationMs > 0 ? ` (${h.durationMs}ms)` : ""}
                    </p>
                  </div>
                  <time className="shrink-0 text-2xs text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </li>
              );
            })
          )}
        </ul>
      </div>
      {hasMore && (
        <p className="border-t px-4 py-1.5 text-center text-2xs text-muted-foreground">
          Showing 5 of {events.length} events — scroll for more
        </p>
      )}
    </Panel>
  );
}
