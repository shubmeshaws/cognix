"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Panel } from "@/components/dashboard/Panel";
import {
  PodActionBadge,
  type PodActionBadgeVariant,
} from "@/components/dashboard/PodActionBadge";
import { podStatusVariant, StatusDot } from "@/components/dashboard/StatusDot";
import { Button } from "@/components/ui/button";
import { useAgentToken } from "@/hooks/useAgentToken";
import { useManualHealControl } from "@/hooks/useManualHealControl";
import {
  formatHealActionLabel,
  healAwaitingApproval,
} from "@/lib/heal-labels";
import {
  findHealForPod,
  isRecentlyHealed,
  podMatchesHeal,
  RECENTLY_HEALED_MS,
} from "@/lib/pod-health";
import { parseApiErrorMessage, triggerManualPodHeal } from "@/lib/api";
import { useHealRules } from "@/lib/query";
import { selectVisibleApprovals, useClusterStore } from "@/stores/cluster";
import type { HealRecord, HealRuleId, PodSummary } from "@/types/api";

const VISIBLE_POD_ROWS = 10;
/** Header + 10 table rows (2.5rem each) — fixed viewport, scroll when more pods */
const POD_TABLE_VIEWPORT_CLASS = "h-[calc(2.5rem*11)] max-h-[calc(2.5rem*11)] shrink-0";

type PodHealthRow = {
  pod: PodSummary;
  heal?: HealRecord;
  /** Issue label when pod has no live issue but was recently healed */
  healedIssueType?: string;
};

function podKey(namespace: string, name: string): string {
  return `${namespace}/${name}`;
}

function buildPodHealthRows(
  pods: PodSummary[],
  heals: HealRecord[],
): PodHealthRow[] {
  const recentHeals = heals.filter(isRecentlyHealed);
  const seen = new Set<string>();
  const rows: PodHealthRow[] = [];

  for (const pod of pods) {
    if (!pod.issueType) continue;
    const key = podKey(pod.namespace, pod.name);
    seen.add(key);
    rows.push({ pod, heal: findHealForPod(pod, heals) });
  }

  for (const heal of recentHeals) {
    const matchingPods = pods.filter((p) => podMatchesHeal(p, heal));
    if (matchingPods.length > 0) {
      for (const pod of matchingPods) {
        const key = podKey(pod.namespace, pod.name);
        if (seen.has(key)) {
          const row = rows.find(
            (r) =>
              r.pod.namespace === pod.namespace && r.pod.name === pod.name,
          );
          if (row) row.heal = heal;
          continue;
        }
        seen.add(key);
        rows.push({
          pod,
          heal,
          healedIssueType: pod.issueType ? undefined : heal.issueType,
        });
      }
      continue;
    }

    const key = podKey(heal.namespace, heal.podName);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      pod: {
        name: heal.podName,
        namespace: heal.namespace,
        phase: "Running",
        restartCount: 0,
        ready: true,
        issueType: null,
        hasActiveHeal: false,
      },
      heal,
      healedIssueType: heal.issueType,
    });
  }

  return rows.sort((a, b) => {
    const aHealed = a.heal && isRecentlyHealed(a.heal);
    const bHealed = b.heal && isRecentlyHealed(b.heal);
    if (aHealed !== bHealed) return aHealed ? -1 : 1;
    const aIssue = Boolean(a.pod.issueType);
    const bIssue = Boolean(b.pod.issueType);
    if (aIssue !== bIssue) return aIssue ? -1 : 1;
    return a.pod.name.localeCompare(b.pod.name);
  });
}

type ActionDisplay = { variant: PodActionBadgeVariant; label?: string };

function actionDisplay(
  pod: PodSummary,
  heals: HealRecord[],
  pendingHealIds: ReadonlySet<string>,
  linkedHeal?: HealRecord,
): ActionDisplay | null {
  const heal = linkedHeal ?? findHealForPod(pod, heals);

  if (pod.hasActiveHeal) {
    return { variant: "healing" };
  }

  if (heal && heal.status === "pending") {
    if (healAwaitingApproval(heal, pendingHealIds)) {
      return { variant: "approval" };
    }
    return { variant: "healing" };
  }

  if (heal && isRecentlyHealed(heal)) {
    return { variant: "healed" };
  }

  if (heal?.status === "skipped") {
    return { variant: "skipped" };
  }

  if (heal?.status === "failed") {
    return { variant: "failed" };
  }

  if (heal?.actionTaken) {
    return {
      variant: "neutral",
      label: formatHealActionLabel(heal.actionTaken),
    };
  }

  return null;
}

function isRuleEnabledForIssue(
  rules: Record<HealRuleId, boolean> | undefined,
  issueType: string | null | undefined,
): boolean {
  if (!rules || !issueType) return false;
  return rules[issueType as HealRuleId] === true;
}

function getIssueBadgeClasses(
  issueType: string | null | undefined,
  isHealed: boolean,
): string {
  const base = "rounded px-1.5 py-0.5 text-2xs font-medium";
  if (isHealed) {
    return `${base} bg-muted text-muted-foreground`;
  }
  const critical = [
    "CrashLoop",
    "OOM",
    "ImagePull",
    "NodePressure",
    "MultiVolumeAttachment",
  ];
  if (issueType && critical.includes(issueType)) {
    return `${base} bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300`;
  }
  return `${base} bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300`;
}

export function PodHealthTable({
  pods,
  heals,
}: {
  pods: PodSummary[];
  heals: HealRecord[];
}) {
  const token = useAgentToken();
  const clusterId = useClusterStore((s) => s.activeClusterId);
  const { manualHealActive } = useManualHealControl();
  const healRulesQuery = useHealRules();
  const pendingApprovals = useClusterStore((s) => s.pendingApprovals);
  const pendingHealIds = useMemo(
    () =>
      new Set(
        selectVisibleApprovals(pendingApprovals).map((approval) => approval.healId),
      ),
    [pendingApprovals],
  );
  const queryClient = useQueryClient();
  const [healingKeys, setHealingKeys] = useState<Set<string>>(new Set());
  const [healErrors, setHealErrors] = useState<Record<string, string>>({});

  const rows = buildPodHealthRows(pods, heals);
  const hasMore = rows.length > VISIBLE_POD_ROWS;
  const recentHealCount = heals.filter(isRecentlyHealed).length;
  const rules = healRulesQuery.data?.rules;
  const healJobPods = healRulesQuery.data?.healJobPods ?? false;
  const healWorkerPods = healRulesQuery.data?.healWorkerPods ?? true;
  const showHealColumn = manualHealActive;
  const colCount = showHealColumn ? 6 : 5;

  const triggerHeal = useCallback(
    async (namespace: string, podName: string) => {
      if (!token || !clusterId) return;
      const key = podKey(namespace, podName);
      setHealErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setHealingKeys((prev) => new Set(prev).add(key));
      try {
        await triggerManualPodHeal(token, clusterId, namespace, podName);
        void queryClient.invalidateQueries({ queryKey: ["heals", clusterId] });
        void queryClient.invalidateQueries({ queryKey: ["pods", clusterId] });
      } catch (err) {
        setHealErrors((prev) => ({
          ...prev,
          [key]: parseApiErrorMessage(err),
        }));
      } finally {
        setHealingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [token, clusterId, queryClient],
  );

  return (
    <Panel
      title="Pod health"
      viewAllPrompt="Show full pod health table with filters"
      className="min-w-0"
    >

      <div
        className={`panel-scroll overflow-x-auto overflow-y-scroll ${POD_TABLE_VIEWPORT_CLASS}`}
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="sticky top-0 z-10 bg-card px-4 py-2 font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                Pod
              </th>
              <th className="sticky top-0 z-10 w-[1%] whitespace-nowrap bg-card px-2 py-2 font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                NS
              </th>
              <th className="sticky top-0 z-10 w-[1%] whitespace-nowrap bg-card px-2 py-2 font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                Status
              </th>
              <th className="sticky top-0 z-10 w-[1%] whitespace-nowrap bg-card px-2 py-2 font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                Issue
              </th>
              <th className="sticky top-0 z-10 w-[1%] whitespace-nowrap bg-card px-2 py-2 font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                Action
              </th>
              {showHealColumn && (
                <th className="sticky top-0 z-10 w-[1%] whitespace-nowrap bg-card px-2 py-2 font-medium shadow-[0_1px_0_0_hsl(var(--border))]">
                  Heal
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {pods.length === 0
                    ? "Connect a cluster to load pods"
                    : "No pods with issues"}
                </td>
              </tr>
            ) : (
              rows.map(({ pod, heal, healedIssueType }) => {
                const action = actionDisplay(pod, heals, pendingHealIds, heal);
                const issueLabel = pod.issueType ?? healedIssueType;
                const linkedHeal = heal ?? findHealForPod(pod, heals);
                const showHealed = linkedHeal && isRecentlyHealed(linkedHeal);
                const alreadyHealed =
                  showHealed || linkedHeal?.status === "healed";
                const key = podKey(pod.namespace, pod.name);
                const ruleOn = isRuleEnabledForIssue(rules, issueLabel);
                const jobPodBlocked = pod.jobOwned === true && !healJobPods;
                const workerPodBlocked =
                  pod.workerOwned === true && !healWorkerPods;
                const scopePodBlocked = jobPodBlocked || workerPodBlocked;
                const canManualHeal =
                  manualHealActive &&
                  ruleOn &&
                  Boolean(issueLabel) &&
                  Boolean(pod.issueType) &&
                  !alreadyHealed &&
                  linkedHeal?.status !== "pending" &&
                  !pod.hasActiveHeal &&
                  !healingKeys.has(key) &&
                  !scopePodBlocked;
                const isHealing = healingKeys.has(key);
                const healError = healErrors[key];

                return (
                  <tr
                    key={key}
                    className={
                      showHealed
                        ? "border-b border-emerald-200/60 bg-emerald-50/40 last:border-0 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                        : "border-b last:border-0"
                    }
                  >
                    <td className="px-4 py-2 font-medium">
                      <span title={pod.name}>
                        {pod.name}
                      </span>
                    </td>
                    <td className="w-[1%] whitespace-nowrap px-2 py-2 text-muted-foreground">
                      {pod.namespace}
                    </td>
                    <td className="w-[1%] whitespace-nowrap px-2 py-2">
                      <StatusDot
                        variant={podStatusVariant(pod, linkedHeal)}
                      />
                    </td>
                    <td className="w-[1%] whitespace-nowrap px-2 py-2">
                      {issueLabel ? (
                        <span
                          className={getIssueBadgeClasses(
                            issueLabel,
                            !pod.issueType,
                          )}
                        >
                          {issueLabel}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="w-[1%] whitespace-nowrap px-2 py-2">
                      {action ? (
                        <PodActionBadge
                          variant={action.variant}
                          label={action.label}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {showHealColumn && (
                      <td className="w-[1%] whitespace-nowrap px-2 py-2">
                        {alreadyHealed ? (
                          <span className="text-2xs font-medium text-emerald-700 dark:text-emerald-400">
                            healed
                          </span>
                        ) : scopePodBlocked ? (
                          <span
                            className="text-2xs text-muted-foreground"
                            title={
                              jobPodBlocked
                                ? "Enable “Heal job pods” in Rules → Pods"
                                : "Enable “Heal worker deployments” in Rules → Pods"
                            }
                          >
                            {jobPodBlocked ? "job heal off" : "worker heal off"}
                          </span>
                        ) : ruleOn && issueLabel && pod.issueType ? (
                          <div className="flex flex-col gap-0.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={!canManualHeal && !isHealing}
                              onClick={() =>
                                void triggerHeal(pod.namespace, pod.name)
                              }
                            >
                              {isHealing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                "Heal"
                              )}
                            </Button>
                            {healError && (
                              <span
                                className="max-w-[100px] truncate text-2xs text-destructive"
                                title={healError}
                              >
                                {healError}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-2xs text-muted-foreground">
                            {issueLabel && !pod.issueType
                              ? "healed"
                              : issueLabel
                                ? "rule off"
                                : "—"}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <p className="border-t px-4 py-1.5 text-center text-2xs text-muted-foreground">
          Showing 10 of {rows.length} — scroll for more
        </p>
      )}
      {recentHealCount > 0 && (
        <p className="border-t px-4 py-1.5 text-center text-2xs text-emerald-700 dark:text-emerald-400">
          Healed deployments stay visible for {RECENTLY_HEALED_MS / 60_000} min
        </p>
      )}
    </Panel>
  );
}
