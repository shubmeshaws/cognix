"use client";

import { useActorIdentity, useAgentToken } from "@/hooks/useAgentToken";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { approveHeal, parseApiErrorMessage, rejectHeal } from "@/lib/api";
import { recordApprovalAudit } from "@/lib/approval-audit";
import { sortApprovalQueue, useClusterStore } from "@/stores/cluster";
import type { ApprovalRequest, OomMemoryApprovalDetail } from "@/types/api";
import { formatHealActionLabel } from "@/lib/heal-labels";
import { cn } from "@/lib/utils";

const AUTO_EXPIRE_MS = 10 * 60 * 1000;
const SNOOZE_MS = 30 * 60 * 1000;

function formatActionLabel(action: string): string {
  const label = formatHealActionLabel(action);
  if (label === "increase memory") return "increase memory limit";
  if (label === "rollback") return "rollback deployment";
  if (label === "restart") return "restart pod";
  if (label === "escalate") return "escalate to on-call";
  if (label === "scale") return "scale workload";
  return label;
}

function formatApprovalSummary(approval: ApprovalRequest): string {
  const action = formatActionLabel(approval.action);
  const reasoning = approval.reasoning.trim();
  if (!reasoning) return action;
  const short =
    reasoning.length > 120 ? `${reasoning.slice(0, 117)}…` : reasoning;
  return `${action} — ${short}`;
}

function parseMemoryToMb(val: string): number | null {
  const match = val.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  
  if (unit === "gi" || unit === "g") return num * 1024;
  if (unit === "mi" || unit === "m") return num;
  if (unit === "ki" || unit === "k") return num / 1024;
  return num;
}

function getMemoryIncreasePercent(oldLimit: string, newLimit: string): string | null {
  const oldMb = parseMemoryToMb(oldLimit);
  const newMb = parseMemoryToMb(newLimit);
  if (!oldMb || !newMb || oldMb === 0) return null;
  const pct = ((newMb - oldMb) / oldMb) * 100;
  return pct > 0 ? `+${Math.round(pct)}%` : `${Math.round(pct)}%`;
}

function OomMemoryDetails({ memory }: { memory: OomMemoryApprovalDetail }) {
  const percentChange = getMemoryIncreasePercent(memory.memoryLimit, memory.recommendedLimit);
  
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-2xs shrink-0">Specs:</span>
      
      {memory.memoryRequest && (
        <span className="inline-flex items-center gap-1.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/60 px-2 py-0.5 font-mono text-slate-650 dark:text-slate-350">
          <span className="text-2xs font-semibold uppercase text-muted-foreground">req</span>
          <span className="font-bold">{memory.memoryRequest}</span>
        </span>
      )}
      
      <span className="inline-flex items-center gap-1.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/60 px-2 py-0.5 font-mono text-slate-650 dark:text-slate-350">
        <span className="text-2xs font-semibold uppercase text-muted-foreground">limit</span>
        <span className="font-bold">{memory.memoryLimit}</span>
      </span>
      
      <span className="inline-flex items-center gap-1.5 rounded bg-red-50 dark:bg-red-950/20 border border-red-100/60 dark:border-red-900/30 px-2 py-0.5 font-mono text-red-650 dark:text-red-400">
        <span className="text-2xs font-semibold uppercase opacity-75">used</span>
        <span className="font-extrabold">{memory.memoryUsed || "OOM"}</span>
      </span>
      
      <span className="text-slate-400 dark:text-slate-600 font-bold mx-0.5 select-none text-base">➔</span>
      
      <span className="inline-flex items-center gap-1.5 rounded bg-green-50 dark:bg-green-950/20 border border-green-100/60 dark:border-green-900/30 px-2 py-0.5 font-mono text-green-650 dark:text-green-400">
        <span className="text-2xs font-semibold uppercase opacity-75">rec</span>
        <span className="font-extrabold">{memory.recommendedLimit}</span>
        {percentChange && (
          <span className="text-xs bg-green-100 dark:bg-green-900/50 px-1 rounded text-green-700 dark:text-green-350 font-bold font-sans">
            {percentChange}
          </span>
        )}
      </span>
    </div>
  );
}

function ApprovalCard({
  approval,
  queuePosition,
  queueTotal,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onActionComplete,
}: {
  approval: ApprovalRequest;
  queuePosition: number;
  queueTotal: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onActionComplete: () => void;
}) {
  const token = useAgentToken();
  const queryClient = useQueryClient();
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const { id: actorId, email: actorEmail } = useActorIdentity();
  const removeApproval = useClusterStore((s) => s.removeApproval);
  const snoozeApproval = useClusterStore((s) => s.snoozeApproval);
  const addTerminalLine = useClusterStore((s) => s.addTerminalLine);
  const updateHeal = useClusterStore((s) => s.updateHeal);

  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expiredRef = useRef(false);
  const shownAtRef = useRef(Date.now());

  const invalidatePending = useCallback(() => {
    if (activeClusterId) {
      void queryClient.invalidateQueries({
        queryKey: ["pending-approvals", activeClusterId],
      });
    }
  }, [activeClusterId, queryClient]);

  const audit = useCallback(
    (
      action: "approved" | "rejected" | "snoozed" | "auto-rejected",
      detail?: string,
    ) => {
      recordApprovalAudit({
        healId: approval.healId,
        podName: approval.podName,
        namespace: approval.namespace,
        action,
        actorEmail,
        actorId,
        timestamp: new Date().toISOString(),
        detail,
      });
    },
    [approval, actorEmail, actorId],
  );

  const notifyTerminal = useCallback(
    (text: string, level: string = "warn") => {
      addTerminalLine({
        id: `audit-${approval.healId}-${Date.now()}`,
        healId: approval.healId,
        clusterId: activeClusterId ?? "",
        sequence: Date.now(),
        level,
        text,
        timestamp: new Date().toISOString(),
      });
    },
    [addTerminalLine, approval.healId, activeClusterId],
  );

  const runReject = useCallback(
    async (reason: "user" | "auto") => {
      if (expiredRef.current) return;
      if (!token) {
        setError("Not signed in — refresh the page and try again.");
        return;
      }
      expiredRef.current = true;
      setLoading("reject");
      setError(null);

      try {
        await rejectHeal(approval.healId, token);
        audit(
          reason === "auto" ? "auto-rejected" : "rejected",
          reason === "auto" ? "No action within 10 minutes" : undefined,
        );
        updateHeal(approval.healId, { status: "skipped" });
        notifyTerminal(
          reason === "auto"
            ? `[approval] Auto-rejected heal for ${approval.podName} (${approval.namespace}) — no action in 10 minutes`
            : `[approval] Rejected heal for ${approval.podName} (${approval.namespace}) by ${actorEmail}`,
        );
        removeApproval(approval.healId);
        invalidatePending();
        onActionComplete();
      } catch (err) {
        const message = parseApiErrorMessage(err);
        setError(message);
        if (/not pending approval/i.test(message)) {
          removeApproval(approval.healId);
          invalidatePending();
          onActionComplete();
        } else {
          expiredRef.current = false;
        }
      } finally {
        setLoading(null);
      }
    },
    [
      token,
      audit,
      updateHeal,
      notifyTerminal,
      approval,
      actorEmail,
      removeApproval,
      invalidatePending,
      onActionComplete,
    ],
  );

  useEffect(() => {
    shownAtRef.current = Date.now();
    expiredRef.current = false;
    setError(null);
    const timer = setTimeout(() => {
      void runReject("auto");
    }, AUTO_EXPIRE_MS);

    return () => clearTimeout(timer);
  }, [approval.healId, runReject]);

  const handleApprove = async () => {
    if (!token) {
      setError("Not signed in — refresh the page and try again.");
      return;
    }
    setLoading("approve");
    setError(null);
    try {
      await approveHeal(approval.healId, token);
      audit("approved");
      notifyTerminal(
        `[approval] Approved heal for ${approval.podName} (${approval.namespace}) by ${actorEmail}`,
        "ok",
      );
      removeApproval(approval.healId);
      invalidatePending();
      onActionComplete();
    } catch (err) {
      const message = parseApiErrorMessage(err);
      setError(message);
      if (/not pending approval/i.test(message)) {
        removeApproval(approval.healId);
        invalidatePending();
        onActionComplete();
      }
    } finally {
      setLoading(null);
    }
  };

  const handleSnooze = () => {
    const until = Date.now() + SNOOZE_MS;
    snoozeApproval(approval.healId, until);
    audit("snoozed", "Snoozed for 30 minutes");
    notifyTerminal(
      `[approval] Snoozed heal for ${approval.podName} (${approval.namespace}) for 30 minutes`,
    );
    onActionComplete();
  };

  const minutesLeft = Math.max(
    0,
    Math.ceil(
      (AUTO_EXPIRE_MS - (Date.now() - shownAtRef.current)) / 60_000,
    ),
  );

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-350 bg-yellow-50/85 p-3.5 shadow-md text-sm md:text-base",
        "dark:border-amber-500/40 dark:bg-yellow-950/15",
        "flex flex-col md:flex-row md:items-center justify-between gap-4"
      )}
      role="alert"
      aria-labelledby={`approval-title-${approval.healId}`}
    >
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        {/* Header: Title and Controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <span
              id={`approval-title-${approval.healId}`}
              className="text-xs font-bold uppercase tracking-wider text-slate-500 truncate"
            >
              Heal Request
              {queueTotal > 1 && ` (${queuePosition}/${queueTotal})`}
            </span>
            <span className="text-slate-350 dark:text-slate-700">·</span>
            <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100 truncate bg-slate-100 dark:bg-slate-900/70 px-2 py-0.5 rounded border border-slate-250/40 dark:border-slate-800/50">
              {approval.podName}
            </span>
          </div>
        </div>

        {/* Content line */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-slate-700 dark:text-slate-300 mt-0.5">
          {approval.memory ? (
            <OomMemoryDetails memory={approval.memory} />
          ) : (
            <span className="font-medium text-slate-850 dark:text-slate-200">{formatApprovalSummary(approval)}</span>
          )}
          
          <span className="text-slate-350 dark:text-slate-700 font-bold select-none">·</span>
          <span className="text-muted-foreground text-xs md:text-sm">namespace: <strong className="text-slate-800 dark:text-slate-200 font-bold">{approval.namespace}</strong></span>
        </div>

        {error && (
          <p className="mt-1 text-xs font-semibold text-red-650 dark:text-red-455 bg-red-50/60 dark:bg-red-950/15 border border-red-150/50 dark:border-red-950/20 px-2.5 py-1.5 rounded">
            Error: {error}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
        {minutesLeft > 0 && (
          <span className="text-xs text-muted-foreground font-semibold shrink-0 mr-1.5">
            ({minutesLeft}m left)
          </span>
        )}
        {queueTotal > 1 && (
          <div className="flex items-center border border-amber-200/50 dark:border-slate-800/60 rounded bg-amber-50/40 dark:bg-slate-900/30 px-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded hover:bg-amber-100/60 dark:hover:bg-amber-900/20"
              disabled={!canGoPrev || loading !== null}
              onClick={onPrev}
              aria-label="Previous approval"
            >
              <ChevronLeft className="h-4.5 w-4.5 text-amber-700 dark:text-amber-400" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded hover:bg-amber-100/60 dark:hover:bg-amber-900/20"
              disabled={!canGoNext || loading !== null}
              onClick={onNext}
              aria-label="Next approval"
            >
              <ChevronRight className="h-4.5 w-4.5 text-amber-700 dark:text-amber-400" />
            </Button>
          </div>
        )}
        
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-8 gap-1.5 border border-green-600 bg-green-600 text-white hover:bg-green-700 hover:border-green-700 dark:bg-green-700 dark:border-green-700 dark:hover:bg-green-600 text-xs md:text-sm font-bold px-3 shadow-sm transition-colors"
          disabled={loading !== null}
          onClick={() => void handleApprove()}
        >
          {loading === "approve" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Approve
        </Button>
        
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-8 gap-1.5 border border-red-650 bg-red-650 text-white hover:bg-red-700 hover:border-red-700 dark:bg-red-700 dark:border-red-700 dark:hover:bg-red-650 text-xs md:text-sm font-bold px-3 shadow-sm transition-colors"
          disabled={loading !== null}
          onClick={() => void runReject("user")}
        >
          {loading === "reject" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
          Reject
        </Button>
        
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-8 w-8 border-amber-250 bg-white hover:bg-amber-50 dark:border-amber-900/50 dark:bg-slate-900 dark:hover:bg-amber-950/25 transition-colors shadow-sm"
          disabled={loading !== null}
          onClick={handleSnooze}
          title="Snooze 30 minutes"
        >
          <Clock className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function HealApproval({ className }: { className?: string }) {
  const pending = useClusterStore((s) => s.pendingApprovals);
  const [, tick] = useState(0);
  const [queueIndex, setQueueIndex] = useState(0);

  const queue = useMemo(() => sortApprovalQueue(pending), [pending]);

  useEffect(() => {
    setQueueIndex((index) =>
      queue.length === 0 ? 0 : Math.min(index, queue.length - 1),
    );
  }, [queue.length]);

  useEffect(() => {
    const hasSnoozed = pending.some(
      (a) => a.snoozedUntil && a.snoozedUntil > Date.now(),
    );
    if (!hasSnoozed) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [pending]);

  const current = queue[queueIndex] ?? null;
  const canGoPrev = queueIndex > 0;
  const canGoNext = queueIndex < queue.length - 1;

  const handlePrev = () => {
    setQueueIndex((i) => Math.max(0, i - 1));
  };

  const handleNext = () => {
    setQueueIndex((i) => Math.min(queue.length - 1, i + 1));
  };

  const handleActionComplete = () => {
    setQueueIndex((i) => {
      if (queue.length <= 1) return 0;
      return Math.min(i, Math.max(0, queue.length - 2));
    });
  };

  if (!current) return null;

  return (
    <div className={cn(className)}>
      <ApprovalCard
        key={current.healId}
        approval={current}
        queuePosition={queueIndex + 1}
        queueTotal={queue.length}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        onPrev={handlePrev}
        onNext={handleNext}
        onActionComplete={handleActionComplete}
      />
    </div>
  );
}
