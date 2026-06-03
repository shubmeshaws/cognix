import type { SetupHealthCheck } from "@/types/api";

export interface SetupCheckDefinition {
  id: string;
  title: string;
  description: string;
  optional?: boolean;
  setupHref?: string;
  setupLabel?: string;
  installCommand?: string;
}

export const SETUP_CHECK_CATALOG: Record<string, SetupCheckDefinition> = {
  auth: {
    id: "auth",
    title: "Dashboard sign-in",
    description: "Your browser session can call the KubeHealer agent API.",
    setupHref: "/login",
    setupLabel: "Sign in",
  },
  agent: {
    id: "agent",
    title: "KubeHealer agent",
    description: "The Fastify backend that watches clusters and runs heals.",
    installCommand: "pnpm dev:agent",
    setupHref: "/dashboard/settings/agent",
    setupLabel: "Agent settings",
  },
  database: {
    id: "database",
    title: "PostgreSQL",
    description: "Stores clusters, heal history, and configuration.",
    installCommand: "docker compose up -d postgres",
    setupHref: "/dashboard/settings/agent",
    setupLabel: "Check DATABASE_URL",
  },
  ollama: {
    id: "ollama",
    title: "Ollama",
    description: "Local LLM runtime for Meshy and pod diagnosis (when Ollama is in your provider chain).",
    installCommand: "docker compose up -d ollama ollama-pull",
    setupHref: "/dashboard/settings/agent",
    setupLabel: "Configure Ollama",
  },
  llm: {
    id: "llm",
    title: "LLM provider chain",
    description: "Primary AI provider for Meshy chat and automated diagnosis.",
    setupHref: "/dashboard/settings/agent",
    setupLabel: "Configure LLM",
  },
  cluster: {
    id: "cluster",
    title: "Kubernetes cluster",
    description: "At least one cluster must be connected and watched by the agent.",
    setupHref: "/dashboard/clusters",
    setupLabel: "Connect cluster",
  },
  websocket: {
    id: "websocket",
    title: "Live dashboard stream",
    description: "WebSocket feed for real-time pod and heal updates in the UI.",
    setupHref: "/dashboard/clusters",
    setupLabel: "Select cluster",
  },
  teams: {
    id: "teams",
    title: "Microsoft Teams",
    description: "Optional webhook for heal notifications.",
    optional: true,
    setupHref: "/dashboard/settings/integrations",
    setupLabel: "Set up Teams",
  },
};

export function mergeSetupChecks(
  serverChecks: SetupHealthCheck[] | undefined,
  clientChecks: SetupHealthCheck[],
): SetupHealthCheck[] {
  const byId = new Map<string, SetupHealthCheck>();
  for (const check of serverChecks ?? []) {
    byId.set(check.id, check);
  }
  for (const check of clientChecks) {
    byId.set(check.id, check);
  }

  const order = [
    "auth",
    "agent",
    "database",
    "cluster",
    "websocket",
    "llm",
    "ollama",
    "teams",
  ];

  return order
    .map((id) => byId.get(id))
    .filter((check): check is SetupHealthCheck => Boolean(check));
}

export function countRequiredChecks(checks: SetupHealthCheck[]): {
  ready: number;
  total: number;
} {
  let ready = 0;
  let total = 0;

  for (const check of checks) {
    const def = SETUP_CHECK_CATALOG[check.id];
    if (def?.optional || check.meta?.skipped === true) continue;
    total += 1;
    if (check.ok) ready += 1;
  }

  return { ready, total };
}
