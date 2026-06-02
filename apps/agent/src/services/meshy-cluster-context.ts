import type { V1Deployment, V1Node } from "@kubernetes/client-node";
import {
  asksMeshyCount,
  asksMeshyList,
  asksMeshyName,
  inferMeshyResourceFocus,
} from "@kubehealer/shared";

import type { ClusterConnection } from "../k8s/connection.js";
import { raceTimeout } from "../lib/timeout.js";
import type { PodSummary } from "../watcher/pod-snapshot.js";

const API_TIMEOUT_MS = 12_000;

export interface MeshyClusterContext {
  fetchedAt: string;
  version: string;
  namespaces: string[];
  nodes: Array<{ name: string; status: string; roles: string[] }>;
  nodeCount: number;
  readyNodeCount: number;
  pods: PodSummary[];
  podStats: {
    total: number;
    healthy: number;
    unhealthy: number;
    byPhase: Record<string, number>;
  };
  deployments: Array<{
    namespace: string;
    name: string;
    replicas: number;
    ready: number;
    available: number;
  }>;
  deploymentCount: number;
  services: Array<{
    namespace: string;
    name: string;
    type: string;
    clusterIP: string;
  }>;
  serviceCount: number;
  nodepools: Array<{ name: string }>;
  nodepoolCount: number;
  nodeclaims: Array<{ name: string; phase?: string }>;
  nodeclaimCount: number;
}

function nodeRoles(labels: Record<string, string> | undefined): string[] {
  if (!labels) return ["worker"];
  const roles: string[] = [];
  for (const key of Object.keys(labels)) {
    if (key.startsWith("node-role.kubernetes.io/")) {
      const role = key.split("/")[1];
      if (role) roles.push(role);
    }
  }
  return roles.length > 0 ? roles : ["worker"];
}

function nodeReadyStatus(node: V1Node): string {
  const ready = node.status?.conditions?.find((c) => c.type === "Ready");
  if (ready?.status === "True") return "Ready";
  if (ready?.status === "False") return "NotReady";
  return "Unknown";
}

function summarizePods(pods: PodSummary[]): MeshyClusterContext["podStats"] {
  const byPhase: Record<string, number> = {};
  let healthy = 0;
  let unhealthy = 0;

  for (const pod of pods) {
    byPhase[pod.phase] = (byPhase[pod.phase] ?? 0) + 1;
    if (pod.issueType || !pod.ready) unhealthy += 1;
    else healthy += 1;
  }

  return { total: pods.length, healthy, unhealthy, byPhase };
}

export async function fetchMeshyClusterContext(
  connection: ClusterConnection,
  pods: PodSummary[],
): Promise<MeshyClusterContext> {
  const [health, nodes, namespaces, deployments, services, nodepools, nodeclaims] =
    await Promise.all([
    raceTimeout(connection.healthCheck(), 5_000, {
      ok: false,
      version: "unknown",
    }),
    raceTimeout(connection.listNodes(), API_TIMEOUT_MS, null),
    raceTimeout(connection.listNamespaces(), 5_000, null),
    raceTimeout(connection.listDeploymentsWithTimeout(API_TIMEOUT_MS), API_TIMEOUT_MS, null),
    raceTimeout(connection.listServicesWithTimeout(API_TIMEOUT_MS), API_TIMEOUT_MS, null),
    raceTimeout(
      connection.listClusterCustomObjectsWithTimeout(
        "karpenter.sh",
        "v1",
        "nodepools",
        API_TIMEOUT_MS,
      ),
      API_TIMEOUT_MS,
      null,
    ),
    raceTimeout(
      connection.listClusterCustomObjectsWithTimeout(
        "karpenter.sh",
        "v1",
        "nodeclaims",
        API_TIMEOUT_MS,
      ),
      API_TIMEOUT_MS,
      null,
    ),
  ]);

  const nodeItems = nodes ?? [];
  const mappedNodes = nodeItems.map((node) => ({
    name: node.metadata?.name ?? "unknown",
    status: nodeReadyStatus(node),
    roles: nodeRoles(node.metadata?.labels),
  }));

  const deploymentItems = (deployments ?? []).map((d: V1Deployment) => ({
    namespace: d.metadata?.namespace ?? "default",
    name: d.metadata?.name ?? "unknown",
    replicas: d.spec?.replicas ?? 0,
    ready: d.status?.readyReplicas ?? 0,
    available: d.status?.availableReplicas ?? 0,
  }));

  const serviceItems = (services ?? []).map((svc) => ({
    namespace: svc.metadata?.namespace ?? "default",
    name: svc.metadata?.name ?? "unknown",
    type: svc.spec?.type ?? "ClusterIP",
    clusterIP: svc.spec?.clusterIP ?? "None",
  }));

  const nodepoolItems = (nodepools ?? []).map((np) => ({ name: np.name }));
  const nodeclaimItems = (nodeclaims ?? []).map((nc) => ({
    name: nc.name,
    phase: nc.phase,
  }));

  return {
    fetchedAt: new Date().toISOString(),
    version: health.version,
    namespaces: namespaces ?? [],
    nodes: mappedNodes,
    nodeCount: mappedNodes.length,
    readyNodeCount: mappedNodes.filter((n) => n.status === "Ready").length,
    pods,
    podStats: summarizePods(pods),
    deployments: deploymentItems,
    deploymentCount: deploymentItems.length,
    services: serviceItems,
    serviceCount: serviceItems.length,
    nodepools: nodepoolItems,
    nodepoolCount: nodepoolItems.length,
    nodeclaims: nodeclaimItems,
    nodeclaimCount: nodeclaimItems.length,
  };
}

export function formatMeshyClusterContext(
  ctx: MeshyClusterContext,
  clusterMeta: { name: string; contextName: string; serverUrl: string },
): string {
  const phaseLines = Object.entries(ctx.podStats.byPhase)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([phase, count]) => `  - ${phase}: ${count}`)
    .join("\n");

  const unhealthyPods = ctx.pods
    .filter((p) => p.issueType || !p.ready)
    .slice(0, 12)
    .map(
      (p) =>
        `  - ${p.namespace}/${p.name} phase=${p.phase} ready=${p.ready} issue=${p.issueType ?? "none"} restarts=${p.restartCount}`,
    )
    .join("\n");

  const nodeLines = ctx.nodes
    .slice(0, 12)
    .map((n) => `  - ${n.name} status=${n.status} roles=${n.roles.join(",")}`)
    .join("\n");

  const deployLines = ctx.deployments
    .slice(0, 12)
    .map(
      (d) =>
        `  - ${d.namespace}/${d.name} replicas=${d.replicas} ready=${d.ready} available=${d.available}`,
    )
    .join("\n");

  const serviceLines = ctx.services
    .slice(0, 12)
    .map((s) => `  - ${s.namespace}/${s.name} type=${s.type} clusterIP=${s.clusterIP}`)
    .join("\n");

  const nodepoolLines = ctx.nodepools
    .slice(0, 12)
    .map((np) => `  - ${np.name}`)
    .join("\n");

  const nodeclaimLines = ctx.nodeclaims
    .slice(0, 12)
    .map((nc) => `  - ${nc.name}${nc.phase ? ` phase=${nc.phase}` : ""}`)
    .join("\n");

  return `LIVE CLUSTER DATA (queried via Kubernetes API at ${ctx.fetchedAt}):
- Cluster display name: ${clusterMeta.name}
- Kubernetes context: ${clusterMeta.contextName}
- API server: ${clusterMeta.serverUrl}
- Kubernetes version: ${ctx.version}
- Namespaces (${ctx.namespaces.length}): ${ctx.namespaces.slice(0, 20).join(", ") || "unknown"}
- Nodes: ${ctx.nodeCount} total, ${ctx.readyNodeCount} ready
${nodeLines || "  - (no node data)"}
- Pods: ${ctx.podStats.total} total, ${ctx.podStats.healthy} healthy, ${ctx.podStats.unhealthy} unhealthy
- Pod phases:
${phaseLines || "  - (none)"}
${unhealthyPods ? `- Unhealthy pods:\n${unhealthyPods}` : "- Unhealthy pods: none"}
- Deployments (${ctx.deploymentCount}):
${deployLines || "  - (none listed)"}
- Services (${ctx.serviceCount}):
${serviceLines || "  - (none listed)"}
- Karpenter NodePools (${ctx.nodepoolCount}):
${nodepoolLines || "  - (none — CRD may not be installed)"}
- Karpenter NodeClaims (${ctx.nodeclaimCount}):
${nodeclaimLines || "  - (none — CRD may not be installed)"}`;
}

function formatPhaseBreakdown(byPhase: Record<string, number>): string {
  return Object.entries(byPhase)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([phase, count]) => `${phase}: ${count}`)
    .join(", ");
}

function kubectlBlock(command: string): string {
  return `\n\n\`\`\`bash\n${command}\n\`\`\``;
}

export function tryMeshyDirectAnswer(
  message: string,
  ctx: MeshyClusterContext,
  clusterMeta: { name: string; contextName: string; serverUrl: string },
  voiceMode: boolean,
): string | null {
  const msg = message.toLowerCase().trim();

  if (
    /\b(cluster name|name of (the |my )?cluster)\b/i.test(msg) ||
    /\bwhat('s| is) (the |my )?cluster (called|name)\b/i.test(msg)
  ) {
    return voiceMode
      ? `Your cluster is ${clusterMeta.name}.`
      : `Your connected cluster is **${clusterMeta.name}**.\n- Kubernetes: \`${ctx.version}\`\n- Context: \`${clusterMeta.contextName}\`\n- API server: \`${clusterMeta.serverUrl}\``;
  }

  if (/\b(kubernetes|k8s|cluster)\s+version\b/i.test(msg) || /\bwhat version\b/i.test(msg)) {
    return voiceMode
      ? `Kubernetes version is ${ctx.version}.`
      : `This cluster is running **Kubernetes ${ctx.version}** (from the API server).`;
  }

  if (/\bhow many nodes\b|\bnode count\b|\bnumber of nodes\b/i.test(msg)) {
    return voiceMode
      ? `${ctx.nodeCount} nodes, ${ctx.readyNodeCount} ready.`
      : `**${ctx.nodeCount}** nodes — **${ctx.readyNodeCount}** Ready, **${ctx.nodeCount - ctx.readyNodeCount}** not Ready (live API).${kubectlBlock("kubectl get nodes")}`;
  }

  if (/\b(list|show|get)\s+(the\s+)?nodes\b|\bwhat nodes\b/i.test(msg)) {
    if (ctx.nodes.length === 0) {
      return voiceMode ? "No nodes returned from the API." : `The Kubernetes API returned no nodes.${kubectlBlock("kubectl get nodes")}`;
    }
    if (voiceMode) {
      return ctx.nodes
        .slice(0, 6)
        .map((n) => `${n.name} ${n.status}`)
        .join(". ");
    }
    return (
      ctx.nodes
        .map((n) => `- **${n.name}** — *${n.status}*, roles: ${n.roles.join(", ")}`)
        .join("\n") + kubectlBlock("kubectl get nodes -o wide")
    );
  }

  if (/\bhow many namespaces\b|\bnamespace count\b/i.test(msg)) {
    return voiceMode
      ? `${ctx.namespaces.length} namespaces.`
      : `**${ctx.namespaces.length}** namespaces: ${ctx.namespaces.slice(0, 15).join(", ")}${ctx.namespaces.length > 15 ? "…" : ""}${kubectlBlock("kubectl get namespaces")}`;
  }

  if (/\bhow many deployments\b|\bdeployment count\b/i.test(msg)) {
    return voiceMode
      ? `${ctx.deploymentCount} deployments.`
      : `**${ctx.deploymentCount}** deployments (live API).${kubectlBlock("kubectl get deployments -A")}`;
  }

  if (/\bhow many services\b|\bservice count\b/i.test(msg)) {
    return voiceMode
      ? `${ctx.serviceCount} services.`
      : `**${ctx.serviceCount}** services (live API).${kubectlBlock("kubectl get services -A")}`;
  }

  if (/\bhow many nodepools?\b|\bnodepool count\b|\bnumber of nodepools?\b/i.test(msg)) {
    if (ctx.nodepoolCount === 0) {
      return voiceMode
        ? "No nodepools found. Karpenter may not be installed."
        : `No **NodePools** returned from the API. If you use Karpenter, install the CRD or check RBAC.${kubectlBlock("kubectl get nodepools")}`;
    }
    const names = ctx.nodepools.slice(0, 10).map((np) => np.name).join(", ");
    return voiceMode
      ? `${ctx.nodepoolCount} nodepools: ${names}.`
      : `**${ctx.nodepoolCount}** Karpenter **NodePools** (live API): ${names}${ctx.nodepoolCount > 10 ? "…" : ""}.${kubectlBlock("kubectl get nodepools")}`;
  }

  if (/\b(list|show|get)\s+(the\s+)?nodepools?\b/i.test(msg)) {
    if (ctx.nodepoolCount === 0) {
      return voiceMode
        ? "No nodepools found."
        : `No **NodePools** found.${kubectlBlock("kubectl get nodepools")}`;
    }
    return voiceMode
      ? ctx.nodepools.map((np) => np.name).slice(0, 8).join(". ")
      : ctx.nodepools
          .map((np) => `- **${np.name}**`)
          .join("\n") + kubectlBlock("kubectl get nodepools");
  }

  if (/\bhow many nodeclaims?\b|\bnodeclaim count\b|\bnumber of nodeclaims?\b/i.test(msg)) {
    if (ctx.nodeclaimCount === 0) {
      return voiceMode
        ? "No nodeclaims found."
        : `No **NodeClaims** returned from the API.${kubectlBlock("kubectl get nodeclaims")}`;
    }
    return voiceMode
      ? `${ctx.nodeclaimCount} nodeclaims.`
      : `**${ctx.nodeclaimCount}** Karpenter **NodeClaims** (live API).${kubectlBlock("kubectl get nodeclaims")}`;
  }

  if (/\b(list|show|get)\s+(the\s+)?nodeclaims?\b/i.test(msg)) {
    if (ctx.nodeclaimCount === 0) {
      return voiceMode
        ? "No nodeclaims found."
        : `No **NodeClaims** found.${kubectlBlock("kubectl get nodeclaims")}`;
    }
    return voiceMode
      ? ctx.nodeclaims.slice(0, 6).map((nc) => `${nc.name} ${nc.phase ?? ""}`.trim()).join(". ")
      : ctx.nodeclaims
          .slice(0, 15)
          .map((nc) => `- **${nc.name}**${nc.phase ? ` — *${nc.phase}*` : ""}`)
          .join("\n") + kubectlBlock("kubectl get nodeclaims");
  }

  if (
    /\bhow many pods\b|\bpod count\b|\bnumber of pods\b/i.test(msg) ||
    (/\btotal pods\b/i.test(msg) && !/\blist\b/i.test(msg))
  ) {
    const phases = formatPhaseBreakdown(ctx.podStats.byPhase);
    return voiceMode
      ? `${ctx.podStats.total} pods, ${ctx.podStats.unhealthy} unhealthy.`
      : `**${ctx.podStats.total}** pods — **${ctx.podStats.healthy}** healthy, **${ctx.podStats.unhealthy}** unhealthy.\n\n*Phases:* ${phases}.${kubectlBlock("kubectl get pods -A")}`;
  }

  if (
    /\b(cluster health|health of (the |my )?cluster|cluster status|health check|how healthy|overall health)\b/i.test(
      msg,
    ) ||
    /\bhow (is|are) (the |my )?cluster\b/i.test(msg)
  ) {
    return voiceMode
      ? `Cluster ${clusterMeta.name}: ${ctx.nodeCount} nodes, ${ctx.podStats.total} pods, ${ctx.podStats.unhealthy} unhealthy.`
      : `**${clusterMeta.name}** status *(live API)*:\n- Kubernetes **${ctx.version}**\n- **${ctx.readyNodeCount}/${ctx.nodeCount}** nodes Ready\n- **${ctx.podStats.total}** pods (${ctx.podStats.healthy} healthy, ${ctx.podStats.unhealthy} unhealthy)\n- **${ctx.deploymentCount}** deployments, **${ctx.serviceCount}** services\n- *Pod phases:* ${formatPhaseBreakdown(ctx.podStats.byPhase)}${kubectlBlock("kubectl get nodes,pods -A --field-selector=status.phase!=Running")}`;
  }

  const focus = inferMeshyResourceFocus(message);
  if (focus) {
    if (focus === "cluster") {
      if (asksMeshyName(message) || msg.split(/\s+/).length <= 2) {
        return voiceMode
          ? `Your cluster is ${clusterMeta.name}.`
          : `Your connected cluster is **${clusterMeta.name}**.\n- Kubernetes: \`${ctx.version}\`\n- Context: \`${clusterMeta.contextName}\``;
      }
      if (/\bhealth\b/i.test(msg)) {
        return voiceMode
          ? `Cluster ${clusterMeta.name}: ${ctx.nodeCount} nodes, ${ctx.podStats.total} pods, ${ctx.podStats.unhealthy} unhealthy.`
          : formatClusterHealthSummary(ctx, clusterMeta.name, false);
      }
    }

    if (focus === "nodes") {
      if (asksMeshyCount(message)) {
        return voiceMode
          ? `${ctx.nodeCount} nodes, ${ctx.readyNodeCount} ready.`
          : `**${ctx.nodeCount}** nodes — **${ctx.readyNodeCount}** Ready.${kubectlBlock("kubectl get nodes")}`;
      }
      if (asksMeshyList(message) || msg.split(/\s+/).length <= 2) {
        if (ctx.nodes.length === 0) {
          return voiceMode ? "No nodes returned from the API." : `No nodes returned.${kubectlBlock("kubectl get nodes")}`;
        }
        return voiceMode
          ? ctx.nodes.slice(0, 6).map((n) => `${n.name} ${n.status}`).join(". ")
          : ctx.nodes.map((n) => `- **${n.name}** — *${n.status}*`).join("\n") + kubectlBlock("kubectl get nodes");
      }
    }

    if (focus === "pods") {
      if (asksMeshyCount(message)) {
        return voiceMode
          ? `${ctx.podStats.total} pods, ${ctx.podStats.unhealthy} unhealthy.`
          : `**${ctx.podStats.total}** pods — **${ctx.podStats.unhealthy}** unhealthy.${kubectlBlock("kubectl get pods -A")}`;
      }
      if (
        asksMeshyList(message) ||
        /\b(name|names)\b/i.test(msg)
      ) {
        if (ctx.pods.length === 0) {
          return voiceMode
            ? "No pods found in the cluster."
            : `No pods found.${kubectlBlock("kubectl get pods -A")}`;
        }
        if (voiceMode) {
          return ctx.pods
            .slice(0, 10)
            .map((p) => `${p.namespace}/${p.name}`)
            .join(". ");
        }
        return (
          ctx.pods
            .slice(0, 20)
            .map((p) => `- **${p.namespace}/${p.name}** — *${p.phase}*, ready=${p.ready}`)
            .join("\n") + kubectlBlock("kubectl get pods -A")
        );
      }
    }

    if (focus === "deployments" && asksMeshyCount(message)) {
      return voiceMode
        ? `${ctx.deploymentCount} deployments.`
        : `**${ctx.deploymentCount}** deployments.${kubectlBlock("kubectl get deployments -A")}`;
    }

    if (focus === "services" && asksMeshyCount(message)) {
      return voiceMode
        ? `${ctx.serviceCount} services.`
        : `**${ctx.serviceCount}** services.${kubectlBlock("kubectl get services -A")}`;
    }

    if (focus === "namespaces" && asksMeshyCount(message)) {
      return voiceMode
        ? `${ctx.namespaces.length} namespaces.`
        : `**${ctx.namespaces.length}** namespaces.${kubectlBlock("kubectl get namespaces")}`;
    }

    if (focus === "nodepools") {
      if (asksMeshyCount(message)) {
        return voiceMode
          ? `${ctx.nodepoolCount} nodepools.`
          : `**${ctx.nodepoolCount}** nodepools.${kubectlBlock("kubectl get nodepools")}`;
      }
      if (asksMeshyList(message) && ctx.nodepoolCount > 0) {
        return voiceMode
          ? ctx.nodepools.slice(0, 8).map((np) => np.name).join(". ")
          : ctx.nodepools.map((np) => `- **${np.name}**`).join("\n");
      }
    }

    if (focus === "nodeclaims" && asksMeshyCount(message)) {
      return voiceMode
        ? `${ctx.nodeclaimCount} nodeclaims.`
        : `**${ctx.nodeclaimCount}** nodeclaims.${kubectlBlock("kubectl get nodeclaims")}`;
    }

    if (focus === "health") {
      return voiceMode
        ? `${clusterMeta.name}: ${ctx.podStats.total} pods, ${ctx.podStats.unhealthy} unhealthy.`
        : formatClusterHealthSummary(ctx, clusterMeta.name, false);
    }
  }

  return null;
}

export function formatClusterHealthSummary(
  ctx: MeshyClusterContext,
  clusterName: string,
  voiceMode: boolean,
): string {
  return voiceMode
    ? `${clusterName}: ${ctx.podStats.total} pods, ${ctx.podStats.unhealthy} unhealthy, ${ctx.readyNodeCount} of ${ctx.nodeCount} nodes ready.`
    : `**${clusterName}** — **${ctx.podStats.total}** pods (*${ctx.podStats.healthy}* healthy, *${ctx.podStats.unhealthy}* unhealthy), **${ctx.readyNodeCount}/${ctx.nodeCount}** nodes Ready, Kubernetes **${ctx.version}**.${kubectlBlock("kubectl get nodes,pods -A")}`;
}
