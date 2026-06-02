import type { TerminalLine } from "@/types/api";

export interface LiveAgentStatusInput {
  clusterId: string | null;
  wsConnected: boolean;
  healingActive: boolean;
  agentReachable: boolean;
  agentLoading: boolean;
}

function systemLine(
  id: string,
  level: string,
  text: string,
  clusterId: string,
  sequence: number,
): TerminalLine {
  return {
    id,
    healId: "system",
    clusterId,
    sequence,
    level,
    text,
    timestamp: new Date().toISOString(),
  };
}

/** Shown in the live terminal when there is no heal output yet. */
export function buildLiveAgentStatusLines(
  input: LiveAgentStatusInput,
): TerminalLine[] {
  const clusterId = input.clusterId ?? "";

  if (!input.clusterId) {
    return [
      systemLine(
        "system-no-cluster",
        "warn",
        "No cluster selected — choose a cluster in the sidebar to connect the agent.",
        clusterId,
        1,
      ),
    ];
  }

  if (!input.wsConnected) {
    return [
      systemLine(
        "system-offline",
        "warn",
        "Agent offline — waiting to come online before heals can run.",
        clusterId,
        1,
      ),
      systemLine(
        "system-offline-hint",
        "info",
        "Heal logs will stream here once the dashboard reconnects to the agent.",
        clusterId,
        2,
      ),
    ];
  }

  if (input.agentLoading) {
    return [
      systemLine(
        "system-connecting",
        "info",
        "Connecting to agent — checking heal service…",
        clusterId,
        1,
      ),
    ];
  }

  if (!input.agentReachable) {
    return [
      systemLine(
        "system-api-down",
        "warn",
        "Agent API unreachable — heal service may be restarting.",
        clusterId,
        1,
      ),
      systemLine(
        "system-api-down-hint",
        "info",
        "Waiting for the agent to come back online. Heal logs will resume automatically.",
        clusterId,
        2,
      ),
    ];
  }

  if (!input.healingActive) {
    return [
      systemLine(
        "system-paused",
        "heal",
        "Agent online — auto-heal is paused (monitoring only).",
        clusterId,
        1,
      ),
      systemLine(
        "system-paused-hint",
        "info",
        "Click Start in the header to resume healing and stream heal output here.",
        clusterId,
        2,
      ),
    ];
  }

  return [
    systemLine(
      "system-watching",
      "info",
      "Agent online — watching the cluster for pod issues.",
      clusterId,
      1,
    ),
    systemLine(
      "system-watching-hint",
      "info",
      "Heal output will appear here when a heal starts.",
      clusterId,
      2,
    ),
  ];
}
