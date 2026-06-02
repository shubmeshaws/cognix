import type { ApprovalRequest, HealRecord, TerminalLine } from "@/types/api";

const APPROVAL_LINE = /awaiting human approval/i;
const HEAL_STARTED = /Heal started — (\S+) on ([^/]+)\/(\S+)/;
const ISSUE_DETECTED = /Issue detected: (\S+) on ([^/]+)\/(\S+)/;
const PLANNED_ACTION = /Planned action: ([^\s(]+)/;

function metaFromTerminalLines(
  lines: TerminalLine[],
  healId: string,
): Pick<ApprovalRequest, "podName" | "namespace" | "action" | "reasoning" | "severity"> | null {
  const forHeal = lines.filter((l) => l.healId === healId);
  let podName = "";
  let namespace = "";
  let action = "pending";
  let reasoning = "";
  const severity = "medium";

  for (const line of forHeal) {
    const started = line.text.match(HEAL_STARTED);
    if (started) {
      action = started[1] ?? action;
      namespace = started[2] ?? namespace;
      podName = started[3] ?? podName;
    }
    const detected = line.text.match(ISSUE_DETECTED);
    if (detected) {
      namespace = detected[2] ?? namespace;
      podName = detected[3] ?? podName;
    }
    const planned = line.text.match(PLANNED_ACTION);
    if (planned) {
      action = planned[1] ?? action;
    }
    if (line.level === "info" && line.text.includes("OOM detected")) {
      reasoning = line.text;
    }
  }

  if (!podName || !namespace) return null;
  return { podName, namespace, action, reasoning, severity };
}

function healStillAwaitingApproval(
  heal: HealRecord,
  terminalLines: TerminalLine[],
): boolean {
  if (heal.status !== "pending") return false;
  if (heal.needsApproval) return true;
  return terminalLines.some(
    (l) => l.healId === heal.id && APPROVAL_LINE.test(l.text),
  );
}

/**
 * Fallback when /pending-approvals is unavailable — only heals still `pending` in the heal list.
 * Does not resurrect skipped/failed heals from old terminal lines.
 */
export function derivePendingApprovals(
  heals: HealRecord[],
  terminalLines: TerminalLine[],
): ApprovalRequest[] {
  const out: ApprovalRequest[] = [];

  for (const heal of heals) {
    if (!healStillAwaitingApproval(heal, terminalLines)) continue;

    const fromTerminal = metaFromTerminalLines(terminalLines, heal.id);
    out.push({
      healId: heal.id,
      podName: heal.podName,
      namespace: heal.namespace,
      issue: heal.issueType,
      action: heal.actionTaken ?? fromTerminal?.action ?? "pending",
      reasoning: fromTerminal?.reasoning ?? "",
      severity: heal.severity ?? fromTerminal?.severity ?? "medium",
      memory: undefined,
      createdAt: heal.createdAt,
    });
  }

  return out.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function mergeApprovalLists(
  ...lists: ApprovalRequest[][]
): ApprovalRequest[] {
  const byId = new Map<string, ApprovalRequest>();
  for (const list of lists) {
    for (const item of list) {
      const prev = byId.get(item.healId);
      byId.set(item.healId, prev ? { ...prev, ...item } : item);
    }
  }
  return [...byId.values()].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}
