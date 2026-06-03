import type { TerminalSocket } from "./terminal-hub.js";

export type ClusterWsEvent =
  | {
      type: "pod:update";
      pod: PodSummaryWs;
    }
  | {
      type: "heal:start";
      healId: string;
      podName: string;
      namespace: string;
      issue: string;
      action?: string;
      severity?: string;
    }
  | {
      type: "heal:complete";
      healId: string;
      status: string;
      durationMs: number;
      podName?: string;
      namespace?: string;
      issue?: string;
      action?: string;
      severity?: string;
      deploymentName?: string;
      rolloutComplete?: boolean;
    }
  | {
      type: "terminal:line";
      healId: string;
      line: TerminalLineWs;
    }
  | {
      type: "alert:new";
      alert: AlertWs;
    }
  | {
      type: "approval:required";
      healId: string;
      podName: string;
      namespace: string;
      issue?: string;
      action: string;
      reasoning: string;
      severity: string;
      memory?: {
        containerName: string;
        memoryLimit: string;
        memoryRequest?: string;
        memoryUsed?: string;
        recommendedLimit: string;
      };
    };

export interface PodSummaryWs {
  name: string;
  namespace: string;
  phase: string;
  restartCount: number;
  ready: boolean;
  issueType: string | null;
  hasActiveHeal: boolean;
  jobOwned: boolean;
  workerOwned: boolean;
}

export interface TerminalLineWs {
  id: string;
  sequence: number;
  level: string;
  text: string;
  ts: string;
}

export interface AlertWs {
  id: string;
  clusterId: string;
  podName: string;
  namespace: string;
  message: string;
  severity: string;
  createdAt: string;
}

const OPEN = 1;

export class ClusterWebSocketHub {
  private readonly clients = new Map<string, Set<TerminalSocket>>();

  register(clusterId: string, socket: TerminalSocket): void {
    let set = this.clients.get(clusterId);
    if (!set) {
      set = new Set();
      this.clients.set(clusterId, set);
    }
    set.add(socket);

    const remove = () => {
      set?.delete(socket);
      if (set?.size === 0) this.clients.delete(clusterId);
    };
    socket.on("close", remove);
    socket.on("error", remove);
  }

  broadcastToCluster(clusterId: string, event: ClusterWsEvent): void {
    const set = this.clients.get(clusterId);
    if (!set?.size) return;

    const payload = JSON.stringify(event);
    for (const client of set) {
      if (client.readyState === OPEN) {
        client.send(payload);
      }
    }
  }

  watcherCount(): number {
    let total = 0;
    for (const set of this.clients.values()) {
      total += set.size;
    }
    return total;
  }

  connectedClusters(): number {
    return this.clients.size;
  }
}
