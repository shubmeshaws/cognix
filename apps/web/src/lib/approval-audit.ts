import type { ApprovalAuditEntry } from "@/types/api";

const STORAGE_KEY = "kubehealer:approval-audit";
const MAX_ENTRIES = 500;

export function recordApprovalAudit(entry: ApprovalAuditEntry): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: ApprovalAuditEntry[] = raw ? (JSON.parse(raw) as ApprovalAuditEntry[]) : [];
    list.unshift(entry);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(list.slice(0, MAX_ENTRIES)),
    );
  } catch {
    // ignore quota / parse errors
  }
}

export function getApprovalAudit(): ApprovalAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ApprovalAuditEntry[]) : [];
  } catch {
    return [];
  }
}
