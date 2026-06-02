import type { TerminalLine } from "@/types/api";

export type TerminalPhase = "detect" | "llm" | "execute" | "verify";

export interface PhaseMarker {
  phase: TerminalPhase;
  label: string;
  /** 0–1 position on timeline */
  ratio: number;
  lineIndex: number;
}

const PHASE_LABELS: Record<TerminalPhase, string> = {
  detect: "Detect",
  llm: "LLM",
  execute: "Execute",
  verify: "Verify",
};

function ts(line: TerminalLine): number {
  return new Date(line.timestamp).getTime();
}

export function computePhaseMarkers(lines: TerminalLine[]): PhaseMarker[] {
  if (lines.length === 0) return [];

  const t0 = ts(lines[0]);
  const t1 = ts(lines[lines.length - 1]);
  const span = Math.max(t1 - t0, 1);
  const ratioAt = (index: number) =>
    Math.min(1, Math.max(0, (ts(lines[index]) - t0) / span));

  const cmdIdx = lines.findIndex((l) => l.level === "cmd");
  const verifyIdx = lines.findIndex((l) =>
    /waiting for|ready|rollout completed|verify/i.test(l.text),
  );
  const healIdx = lines.findIndex((l) => l.level === "heal");
  const warnApprovalIdx = lines.findIndex((l) =>
    /approval|awaiting human/i.test(l.text),
  );

  const llmIdx =
    healIdx >= 0
      ? healIdx
      : warnApprovalIdx >= 0
        ? warnApprovalIdx
        : cmdIdx > 0
          ? Math.max(0, cmdIdx - 1)
          : Math.floor(lines.length * 0.25);

  const execIdx = cmdIdx >= 0 ? cmdIdx : Math.floor(lines.length * 0.5);
  const verIdx =
    verifyIdx >= 0 ? verifyIdx : Math.max(execIdx, lines.length - 1);

  const phases: Array<{ phase: TerminalPhase; lineIndex: number }> = [
    { phase: "detect", lineIndex: 0 },
    { phase: "llm", lineIndex: llmIdx },
    { phase: "execute", lineIndex: execIdx },
    { phase: "verify", lineIndex: verIdx },
  ];

  return phases.map(({ phase, lineIndex }) => ({
    phase,
    label: PHASE_LABELS[phase],
    ratio: ratioAt(lineIndex),
    lineIndex,
  }));
}

export function formatTerminalTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatLinePlain(line: TerminalLine): string {
  const level = line.level.toUpperCase().padEnd(4, " ").slice(0, 4);
  return `[${formatTerminalTimestamp(line.timestamp)}] ${level}  ${line.text}`;
}

export function sessionToPlainText(lines: TerminalLine[]): string {
  return lines.map(formatLinePlain).join("\n");
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
