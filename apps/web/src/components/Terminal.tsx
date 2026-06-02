"use client";

import {
  ChevronDown,
  ChevronUp,
  Download,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  computePhaseMarkers,
  downloadTextFile,
  formatLinePlain,
  formatTerminalTimestamp,
  sessionToPlainText,
  type PhaseMarker,
} from "@/lib/terminal-utils";
import { useHealingControl } from "@/hooks/useHealingControl";
import { buildLiveAgentStatusLines } from "@/lib/live-terminal-status";
import { useAgentStatus, useHealTerminal } from "@/lib/query";
import { cn } from "@/lib/utils";
import { useClusterStore } from "@/stores/cluster";
import type { TerminalLine } from "@/types/api";

const MAX_LIVE_LINES = 500;

const LEVEL_COLORS: Record<string, string> = {
  info: "text-blue-600 dark:text-blue-400",
  warn: "text-amber-600 dark:text-amber-400",
  err: "text-red-600 dark:text-red-400",
  error: "text-red-600 dark:text-red-400",
  ok: "text-green-600 dark:text-green-400",
  cmd: "text-purple-600 dark:text-purple-400",
  heal: "text-cyan-600 dark:text-cyan-400",
};

const SPEEDS = [1, 2, 5] as const;
type Speed = (typeof SPEEDS)[number];

export interface TerminalProps {
  healId?: string;
  live?: boolean;
  className?: string;
  /** Fill parent panel height; scroll inside (dashboard card) */
  fillViewport?: boolean;
  /** Always show scrollbar rail + up/down controls (dashboard) */
  showScrollControls?: boolean;
  /** Tailwind height classes for the scroll viewport */
  heightClassName?: string;
}

function normalizeLevel(level: string): string {
  return level.toLowerCase();
}

function levelLabel(level: string): string {
  const n = normalizeLevel(level);
  if (n === "err" || n === "error") return "ERR";
  return n.toUpperCase();
}

function replayDelayMs(
  prev: TerminalLine | undefined,
  curr: TerminalLine,
  speed: Speed,
): number {
  if (!prev) return 80;
  const delta = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
  const scaled = delta > 0 ? delta / speed : 120 / speed;
  return Math.min(2000, Math.max(40, scaled));
}

export function Terminal({
  healId,
  live = false,
  className,
  fillViewport = false,
  showScrollControls = false,
  heightClassName = "h-[220px]",
}: TerminalProps) {
  const useAbsoluteViewport = fillViewport || showScrollControls;
  const viewportClassName = useAbsoluteViewport
    ? cn(
        "absolute left-0 top-0 bottom-0 overflow-y-scroll",
        showScrollControls ? "right-9" : "right-0",
      )
    : cn(heightClassName, "overflow-y-scroll");
  const isReplay = Boolean(healId) && !live;
  const liveLines = useClusterStore((s) => s.terminalLines);
  const wsConnected = useClusterStore((s) => s.wsConnected);
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const { healingActive } = useHealingControl();
  const agentQuery = useAgentStatus();
  const replayQuery = useHealTerminal(isReplay ? healId : undefined);

  const agentReachable =
    agentQuery.isSuccess && agentQuery.fetchStatus !== "fetching";
  const agentLoading =
    agentQuery.isLoading || agentQuery.fetchStatus === "fetching";

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [fontScale, setFontScale] = useState<number>(1.9);

  useEffect(() => {
    const saved = localStorage.getItem("kubehealer-terminal-font-scale");
    if (saved) {
      const val = parseFloat(saved);
      if (!isNaN(val) && val >= 0.4 && val <= 2.5) {
        setFontScale(val);
      }
    }
  }, []);

  const changeFontScale = (delta: number) => {
    setFontScale((prev) => {
      const next = Math.min(2.5, Math.max(0.4, prev + delta));
      localStorage.setItem("kubehealer-terminal-font-scale", next.toFixed(2));
      return next;
    });
  };

  const resetFontScale = () => {
    setFontScale(1.9);
    localStorage.setItem("kubehealer-terminal-font-scale", "1.9");
  };

  const liveStatusLines = useMemo(
    () =>
      live && mounted
        ? buildLiveAgentStatusLines({
            clusterId: activeClusterId,
            wsConnected,
            healingActive,
            agentReachable,
            agentLoading: agentLoading && !agentQuery.isError,
          })
        : [],
    [
      live,
      mounted,
      activeClusterId,
      wsConnected,
      healingActive,
      agentReachable,
      agentLoading,
      agentQuery.isError,
    ],
  );

  const allLines = useMemo(() => {
    if (isReplay) {
      if (!replayQuery.data || !healId) return [];
      return replayQuery.data.lines.map((line) => ({
        id: line.id,
        healId,
        clusterId: "",
        sequence: line.sequence,
        level: line.level,
        text: line.text,
        timestamp: line.ts,
      }));
    }
    const source = liveLines;
    const filtered = healId
      ? source.filter((l) => l.healId === healId)
      : source;
    return filtered.length > MAX_LIVE_LINES
      ? filtered.slice(-MAX_LIVE_LINES)
      : filtered;
  }, [isReplay, replayQuery.data, healId, liveLines]);

  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [pinnedBottom, setPinnedBottom] = useState(true);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const phaseMarkers = useMemo(() => computePhaseMarkers(allLines), [allLines]);

  const visibleLines = isReplay
    ? allLines.slice(0, playhead)
    : allLines.length > 0
      ? allLines
      : liveStatusLines;
  const atEnd = !isReplay || playhead >= allLines.length;

  useEffect(() => {
    if (!isReplay) return;
    setPlayhead(0);
    setPlaying(false);
    setPinnedBottom(true);
  }, [isReplay, healId, allLines.length]);

  useEffect(() => {
    if (!isReplay || !playing || playhead >= allLines.length) {
      if (isReplay && playhead >= allLines.length) setPlaying(false);
      return;
    }

    const prev = playhead > 0 ? allLines[playhead - 1] : undefined;
    const curr = allLines[playhead];
    const delay = replayDelayMs(prev, curr, speed);

    const timer = setTimeout(() => {
      setPlayhead((p) => p + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [isReplay, playing, playhead, allLines, speed]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const updateScrollAffordances = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 8;
    setCanScrollUp(el.scrollTop > threshold);
    setCanScrollDown(
      el.scrollHeight - el.scrollTop - el.clientHeight > threshold,
    );
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 48;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setPinnedBottom(atBottom);
    updateScrollAffordances();
  }, [updateScrollAffordances]);

  const scrollByPage = useCallback((direction: "up" | "down") => {
    const el = scrollRef.current;
    if (!el) return;
    const delta =
      direction === "up"
        ? -el.clientHeight * 0.85
        : el.clientHeight * 0.85;
    el.scrollBy({ top: delta, behavior: "smooth" });
    if (direction === "down") {
      const atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      if (atBottom) setPinnedBottom(true);
    } else {
      setPinnedBottom(false);
    }
  }, []);

  useEffect(() => {
    if (pinnedBottom) scrollToBottom(isReplay ? "auto" : "smooth");
  }, [visibleLines.length, pinnedBottom, scrollToBottom, isReplay]);

  useEffect(() => {
    const run = () => updateScrollAffordances();
    run();
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    return () => cancelAnimationFrame(id);
  }, [visibleLines.length, fillViewport, showScrollControls, updateScrollAffordances]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => updateScrollAffordances());
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollAffordances]);

  const jumpToPhase = (marker: PhaseMarker) => {
    setPlayhead(Math.min(marker.lineIndex + 1, allLines.length));
    setPlaying(false);
    setPinnedBottom(true);
  };

  const jumpToEnd = () => {
    setPlayhead(allLines.length);
    setPlaying(false);
    setPinnedBottom(true);
  };

  const handleExport = () => {
    const text = sessionToPlainText(allLines);
    downloadTextFile(
      `heal-${healId ?? "session"}-terminal.txt`,
      text,
    );
  };

  const showNewLinesPill = !pinnedBottom && visibleLines.length > 0;

  return (
    <div className={cn("flex w-full min-w-0 flex-col", className)}>
      {isReplay && allLines.length > 0 && (
        <PhaseTimeline
          markers={phaseMarkers}
          playRatio={
            allLines.length > 0 ? playhead / allLines.length : 0
          }
          onSelectPhase={jumpToPhase}
        />
      )}

      <div
        className={cn(
          "relative min-w-0",
          useAbsoluteViewport && "min-h-0 flex-1",
          fillViewport && "h-full",
        )}
      >
        {mounted && (
          <div
            className={cn(
              "absolute right-2 top-2 z-30 flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95",
              showScrollControls && "right-11"
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              onClick={() => changeFontScale(-0.1)}
              title="Decrease font size"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="min-w-[32px] text-center text-3xs font-medium text-slate-500 select-none">
              {Math.round(fontScale * 100)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              onClick={() => changeFontScale(0.1)}
              title="Increase font size"
            >
              <Plus className="h-3 w-3" />
            </Button>
            <div className="mx-0.5 h-3 w-px bg-slate-200 dark:bg-slate-800" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              onClick={resetFontScale}
              title="Reset font size"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={cn(
            "terminal-scroll box-border overflow-x-hidden bg-white px-3 py-2 font-mono text-terminal leading-[1.65] text-slate-800 dark:bg-[#0d1117] dark:text-slate-200",
            viewportClassName,
          )}
          style={{ fontSize: `${fontScale * 0.4}rem` }}
        >
          {replayQuery.isLoading && isReplay ? (
            <p className="text-slate-500">Loading session…</p>
          ) : visibleLines.length === 0 ? (
            <p className="text-slate-500">
              {live && !mounted
                ? "Loading terminal…"
                : "No terminal output for this heal"}
            </p>
          ) : (
            visibleLines.map((line, i) => (
              <TerminalLineRow
                key={line.id}
                line={line}
                isSystem={line.healId === "system"}
                showCursor={
                  live &&
                  allLines.length > 0 &&
                  i === visibleLines.length - 1 &&
                  pinnedBottom
                }
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {showScrollControls && (
          <div
            className="absolute bottom-0 right-0 top-0 z-20 flex w-9 flex-col items-center justify-center gap-1 border-l border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-[#161b22]"
            aria-label="Terminal scroll controls"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-25 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
              disabled={!canScrollUp}
              aria-label="Scroll up"
              title="Scroll up"
              onClick={() => scrollByPage("up")}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <div
              className="my-0.5 h-12 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600"
              aria-hidden
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-600 hover:bg-slate-200 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-25 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
              disabled={!canScrollDown}
              aria-label="Scroll down"
              title="Scroll down"
              onClick={() => scrollByPage("down")}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        )}

        {showNewLinesPill && (
          <button
            type="button"
            onClick={() => {
              setPinnedBottom(true);
              scrollToBottom();
            }}
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 shadow-lg hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            ↓ new lines
          </button>
        )}
      </div>

      {isReplay && (
        <ReplayControls
          playing={playing}
          speed={speed}
          atEnd={atEnd}
          onPlay={() => {
            if (atEnd) setPlayhead(0);
            setPlaying(true);
            setPinnedBottom(true);
          }}
          onPause={() => setPlaying(false)}
          onSpeedChange={setSpeed}
          onJumpEnd={jumpToEnd}
          onExport={handleExport}
        />
      )}
    </div>
  );
}

function TerminalLineRow({
  line,
  showCursor,
  isSystem = false,
}: {
  line: TerminalLine;
  showCursor: boolean;
  isSystem?: boolean;
}) {
  const level = normalizeLevel(line.level);
  return (
    <div
      className={cn(
        "flex min-w-0 gap-2",
        isSystem && "opacity-90",
      )}
    >
      <span
        className="shrink-0 text-slate-500 dark:text-slate-600"
        suppressHydrationWarning
      >
        [{formatTerminalTimestamp(line.timestamp)}]
      </span>
      <span
        className={cn(
          "w-10 shrink-0 font-semibold",
          isSystem
            ? "text-slate-500 dark:text-slate-400"
            : LEVEL_COLORS[level] ?? "text-slate-500 dark:text-slate-400",
        )}
      >
        {isSystem ? "SYS" : levelLabel(line.level)}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 break-all whitespace-pre-wrap",
          LEVEL_COLORS[level] ?? "text-slate-800 dark:text-slate-300",
        )}
      >
        {line.text}
        {showCursor && (
          <span className="ml-0.5 inline-block h-[1em] w-2 animate-pulse bg-slate-500 align-middle dark:bg-slate-300" />
        )}
      </span>
    </div>
  );
}

function PhaseTimeline({
  markers,
  playRatio,
  onSelectPhase,
}: {
  markers: PhaseMarker[];
  playRatio: number;
  onSelectPhase: (m: PhaseMarker) => void;
}) {
  const phaseColors: Record<string, string> = {
    detect: "bg-blue-500/30",
    llm: "bg-cyan-500/30",
    execute: "bg-purple-500/30",
    verify: "bg-green-500/30",
  };

  return (
    <div className="border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-[#0d1117]">
      <div className="relative mb-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        {markers.map((m, i) => {
          const next = markers[i + 1];
          const width = next ? (next.ratio - m.ratio) * 100 : (1 - m.ratio) * 100;
          const left = m.ratio * 100;
          return (
            <div
              key={m.phase}
              className={cn(
                "absolute top-0 h-full",
                phaseColors[m.phase],
              )}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}
        <div
          className="absolute top-0 h-full w-0.5 bg-white/80"
          style={{ left: `${playRatio * 100}%` }}
        />
      </div>
      <div className="flex justify-between gap-1">
        {markers.map((m) => (
          <button
            key={m.phase}
            type="button"
            onClick={() => onSelectPhase(m)}
            className="text-2xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReplayControls({
  playing,
  speed,
  atEnd,
  onPlay,
  onPause,
  onSpeedChange,
  onJumpEnd,
  onExport,
}: {
  playing: boolean;
  speed: Speed;
  atEnd: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSpeedChange: (s: Speed) => void;
  onJumpEnd: () => void;
  onExport: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-[#161b22]">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        onClick={playing ? onPause : onPlay}
      >
        {playing ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        <span className="sr-only">{playing ? "Pause" : "Play"}</span>
      </Button>

      <div className="flex items-center gap-0.5 rounded-md border border-slate-300 p-0.5 dark:border-slate-600">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeedChange(s)}
            className={cn(
              "rounded px-2 py-0.5 text-2xs font-medium",
              speed === s
                ? "bg-slate-700 text-white dark:bg-slate-600"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {s}×
          </button>
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        onClick={onJumpEnd}
        title="Jump to end"
      >
        <SkipForward className="h-3.5 w-3.5" />
      </Button>

      <div className="flex-1" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-slate-700 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        onClick={onExport}
      >
        <Download className="h-3.5 w-3.5" />
        Export
      </Button>
    </div>
  );
}
