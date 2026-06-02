import { create } from "zustand";

import type {
  AlertEvent,
  ApprovalRequest,
  HealRecord,
  PodSummary,
  TerminalLine,
} from "@/types/api";

const MAX_TERMINAL_LINES = 500;

interface ClusterState {
  activeClusterId: string | null;
  wsConnected: boolean;
  /** Instant UI override until agent status confirms pause/resume */
  healingPausedOverride: boolean | null;
  manualHealEnabledOverride: boolean | null;
  pods: PodSummary[];
  heals: HealRecord[];
  alerts: AlertEvent[];
  pendingApprovals: ApprovalRequest[];
  /** Heals hidden locally after approve/reject until API stops returning them. */
  dismissedApprovalHealIds: string[];
  terminalLines: TerminalLine[];

  setCluster: (clusterId: string | null) => void;
  setHealingPausedOverride: (paused: boolean | null) => void;
  setManualHealEnabledOverride: (enabled: boolean | null) => void;
  setWsConnected: (connected: boolean) => void;
  updatePod: (pod: PodSummary) => void;
  setPods: (pods: PodSummary[]) => void;
  addHeal: (heal: HealRecord) => void;
  updateHeal: (
    healId: string,
    patch: Partial<HealRecord> & { status?: HealRecord["status"] },
  ) => void;
  setHeals: (heals: HealRecord[]) => void;
  addAlert: (alert: AlertEvent) => void;
  setAlerts: (alerts: AlertEvent[]) => void;
  addApproval: (approval: ApprovalRequest) => void;
  /** Replace pending list from API while keeping snooze state. */
  syncPendingApprovals: (approvals: ApprovalRequest[]) => void;
  removeApproval: (healId: string) => void;
  snoozeApproval: (healId: string, untilMs: number) => void;
  addTerminalLine: (line: TerminalLine) => void;
  setTerminalLines: (lines: TerminalLine[]) => void;
  reset: () => void;
}

const initialState = {
  activeClusterId: null as string | null,
  wsConnected: false,
  healingPausedOverride: null as boolean | null,
  manualHealEnabledOverride: null as boolean | null,
  pods: [] as PodSummary[],
  heals: [] as HealRecord[],
  alerts: [] as AlertEvent[],
  pendingApprovals: [] as ApprovalRequest[],
  dismissedApprovalHealIds: [] as string[],
  terminalLines: [] as TerminalLine[],
};

export const useClusterStore = create<ClusterState>((set, get) => ({
  ...initialState,

  setCluster: (clusterId) => {
    if (clusterId === get().activeClusterId) return;
    if (typeof window !== "undefined") {
      if (clusterId) {
        localStorage.setItem("kubehealer-active-cluster", clusterId);
      } else {
        localStorage.removeItem("kubehealer-active-cluster");
      }
    }
    set({
      activeClusterId: clusterId,
      pods: [],
      heals: [],
      alerts: [],
      pendingApprovals: [],
      dismissedApprovalHealIds: [],
      terminalLines: [],
      wsConnected: false,
    });
  },

  setWsConnected: (connected) => set({ wsConnected: connected }),

  setHealingPausedOverride: (paused) => set({ healingPausedOverride: paused }),

  setManualHealEnabledOverride: (enabled) =>
    set({ manualHealEnabledOverride: enabled }),

  updatePod: (pod) => {
    const pods = get().pods;
    const key = `${pod.namespace}/${pod.name}`;
    const idx = pods.findIndex((p) => `${p.namespace}/${p.name}` === key);
    if (idx >= 0) {
      const next = [...pods];
      next[idx] = pod;
      set({ pods: next });
    } else {
      set({ pods: [...pods, pod] });
    }
  },

  setPods: (pods) => set({ pods }),

  addHeal: (heal) => {
    const heals = get().heals;
    if (heals.some((h) => h.id === heal.id)) return;
    set({ heals: [heal, ...heals] });
  },

  updateHeal: (healId, patch) => {
    set({
      heals: get().heals.map((h) =>
        h.id === healId ? { ...h, ...patch } : h,
      ),
    });
  },

  setHeals: (heals) => set({ heals }),

  addAlert: (alert) => {
    const alerts = get().alerts;
    if (alerts.some((a) => a.id === alert.id)) return;
    set({ alerts: [alert, ...alerts] });
  },

  setAlerts: (alerts) => set({ alerts }),

  addApproval: (approval) => {
    const pending = get().pendingApprovals;
    if (pending.some((a) => a.healId === approval.healId)) return;
    set({ pendingApprovals: [approval, ...pending] });
  },

  syncPendingApprovals: (incoming) => {
    const dismissed = new Set(get().dismissedApprovalHealIds);
    const incomingIds = new Set(incoming.map((a) => a.healId));
    const snoozeById = new Map(
      get().pendingApprovals.map((a) => [a.healId, a.snoozedUntil] as const),
    );
    set({
      dismissedApprovalHealIds: get().dismissedApprovalHealIds.filter((id) =>
        incomingIds.has(id),
      ),
      pendingApprovals: incoming
        .filter((approval) => !dismissed.has(approval.healId))
        .map((approval) => ({
          ...approval,
          snoozedUntil: snoozeById.get(approval.healId),
        })),
    });
  },

  removeApproval: (healId) => {
    const dismissed = get().dismissedApprovalHealIds;
    set({
      dismissedApprovalHealIds: dismissed.includes(healId)
        ? dismissed
        : [...dismissed, healId],
      pendingApprovals: get().pendingApprovals.filter(
        (a) => a.healId !== healId,
      ),
    });
  },

  snoozeApproval: (healId, untilMs) => {
    set({
      pendingApprovals: get().pendingApprovals.map((a) =>
        a.healId === healId ? { ...a, snoozedUntil: untilMs } : a,
      ),
    });
  },

  addTerminalLine: (line) => {
    const existing = get().terminalLines;
    if (existing.some((l) => l.id === line.id)) return;
    const lines = [...existing, line];
    set({
      terminalLines:
        lines.length > MAX_TERMINAL_LINES
          ? lines.slice(-MAX_TERMINAL_LINES)
          : lines,
    });
  },

  setTerminalLines: (incoming) => {
    const existing = get().terminalLines;
    const byId = new Map(existing.map((l) => [l.id, l]));
    for (const line of incoming) {
      byId.set(line.id, line);
    }
    const merged = [...byId.values()].sort((a, b) => {
      const t = a.timestamp.localeCompare(b.timestamp);
      return t !== 0 ? t : a.sequence - b.sequence;
    });
    set({
      terminalLines:
        merged.length > MAX_TERMINAL_LINES
          ? merged.slice(-MAX_TERMINAL_LINES)
          : merged,
    });
  },

  reset: () => set(initialState),
}));

/** Pending approvals that are not snoozed (for banners + badge). */
export function selectVisibleApprovals(
  pending: ApprovalRequest[],
): ApprovalRequest[] {
  const now = Date.now();
  return pending.filter((a) => !a.snoozedUntil || a.snoozedUntil <= now);
}

/** Oldest-first queue of non-snoozed approvals for the dashboard card. */
export function sortApprovalQueue(
  pending: ApprovalRequest[],
): ApprovalRequest[] {
  return [...selectVisibleApprovals(pending)].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}
