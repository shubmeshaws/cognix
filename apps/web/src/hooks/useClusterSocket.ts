"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAgentToken } from "@/hooks/useAgentToken";
import { getWsBaseUrl } from "@/lib/api";
import { useClusterStore } from "@/stores/cluster";
import type { ClusterWsEvent, HealRecord, TerminalLine } from "@/types/api";

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

export interface UseClusterSocketResult {
  connected: boolean;
  lastEvent: ClusterWsEvent | null;
}

export function useClusterSocket(
  clusterId: string | null,
): UseClusterSocketResult {
  const token = useAgentToken();
  const queryClient = useQueryClient();

  const updatePod = useClusterStore((s) => s.updatePod);
  const addHeal = useClusterStore((s) => s.addHeal);
  const updateHeal = useClusterStore((s) => s.updateHeal);
  const addAlert = useClusterStore((s) => s.addAlert);
  const addApproval = useClusterStore((s) => s.addApproval);
  const removeApproval = useClusterStore((s) => s.removeApproval);
  const addTerminalLine = useClusterStore((s) => s.addTerminalLine);
  const setWsConnected = useClusterStore((s) => s.setWsConnected);

  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<ClusterWsEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const dispatch = useCallback(
    (event: ClusterWsEvent) => {
      setLastEvent(event);

      switch (event.type) {
        case "connected":
          if (clusterId) {
            void queryClient.invalidateQueries({
              queryKey: ["pending-approvals", clusterId],
            });
          }
          break;
        case "pod:update":
          updatePod(event.pod);
          break;
        case "heal:start": {
          const placeholder: HealRecord = {
            id: event.healId,
            clusterId: clusterId ?? "",
            podName: event.podName,
            namespace: event.namespace,
            issueType: event.issue,
            severity: event.severity ?? "medium",
            actionTaken: event.action ?? "pending",
            status: "pending",
            durationMs: 0,
            approvedBy: null,
            createdAt: new Date().toISOString(),
          };
          addHeal(placeholder);
          if (clusterId) {
            void queryClient.invalidateQueries({ queryKey: ["heals", clusterId] });
            void queryClient.invalidateQueries({
              queryKey: ["live-terminal", clusterId],
            });
          }
          break;
        }
        case "heal:complete": {
          const patch: Partial<HealRecord> = {
            status: event.status as HealRecord["status"],
            durationMs: event.durationMs,
          };
          if (event.podName) patch.podName = event.podName;
          if (event.namespace) patch.namespace = event.namespace;
          if (event.issue) patch.issueType = event.issue;
          if (event.severity) patch.severity = event.severity;
          if (event.action) patch.actionTaken = event.action;
          if (event.deploymentName) patch.deploymentName = event.deploymentName;
          if (event.rolloutComplete !== undefined) {
            patch.rolloutComplete = event.rolloutComplete;
          }
          updateHeal(event.healId, patch);
          removeApproval(event.healId);
          if (clusterId) {
            void queryClient.invalidateQueries({ queryKey: ["heals", clusterId] });
            void queryClient.invalidateQueries({
              queryKey: ["live-terminal", clusterId],
            });
          }
          break;
        }
        case "terminal:line": {
          const line: TerminalLine = {
            id: event.line.id,
            healId: event.healId,
            clusterId: clusterId ?? "",
            sequence: event.line.sequence,
            level: event.line.level,
            text: event.line.text,
            timestamp: event.line.ts,
          };
          addTerminalLine(line);
          break;
        }
        case "alert:new":
          addAlert(event.alert);
          break;
        case "approval:required":
          addApproval({
            healId: event.healId,
            podName: event.podName,
            namespace: event.namespace,
            issue: event.issue,
            action: event.action,
            reasoning: event.reasoning,
            severity: event.severity,
            memory: event.memory,
            createdAt: new Date().toISOString(),
          });
          updateHeal(event.healId, {
            status: "pending",
            needsApproval: true,
          });
          if (clusterId) {
            void queryClient.invalidateQueries({
              queryKey: ["pending-approvals", clusterId],
            });
          }
          break;
        default:
          break;
      }
    },
    [
      addAlert,
      addApproval,
      removeApproval,
      addHeal,
      addTerminalLine,
      clusterId,
      updateHeal,
      updatePod,
      queryClient,
      clusterId,
    ],
  );

  useEffect(() => {
    unmountedRef.current = false;

    const clearRetry = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const connect = () => {
      if (!clusterId || !token || unmountedRef.current) return;

      const url = `${getWsBaseUrl()}/ws?clusterId=${encodeURIComponent(clusterId)}&token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
        setWsConnected(true);
        void queryClient.invalidateQueries({
          queryKey: ["live-terminal", clusterId],
        });
      };

      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(String(msg.data)) as ClusterWsEvent;
          if (event.type === "pong") return;
          dispatch(event);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setWsConnected(false);
        wsRef.current = null;
        if (unmountedRef.current) return;

        const delay = Math.min(
          BASE_BACKOFF_MS * 2 ** retryRef.current,
          MAX_BACKOFF_MS,
        );
        retryRef.current += 1;
        retryTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    if (clusterId && token) {
      connect();
    } else {
      setConnected(false);
      setWsConnected(false);
    }

    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 25_000);

    return () => {
      unmountedRef.current = true;
      clearRetry();
      clearInterval(pingInterval);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      setWsConnected(false);
    };
  }, [clusterId, token, dispatch, setWsConnected]);

  return { connected, lastEvent };
}
