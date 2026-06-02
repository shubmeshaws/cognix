import type { Env } from "../config/env.js";
import type { Database } from "../db/client.js";
import type { AgentEventBus } from "../events/bus.js";
import type { HealOrchestrator } from "../healer/orchestrator.js";
import type { ClusterRegistryService } from "../services/clusters.js";
import type { WatcherService } from "../services/watcher.js";
import type { ClusterWebSocketHub } from "../ws/cluster-hub.js";

export type { ClusterWebSocketHub };

export interface ServerDeps {
  db: Database;
  env: Env;
  eventBus: AgentEventBus;
  clusterHub: ClusterWebSocketHub;
  watcher: WatcherService;
  clusterService: ClusterRegistryService;
  orchestrator: HealOrchestrator;
  startedAt: number;
}
