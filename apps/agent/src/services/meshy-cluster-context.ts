import type { V1Deployment, V1Node } from "@kubernetes/client-node";
import {
  asksMeshyCount,
  asksMeshyList,
  asksMeshyName,
  formatMeshyItemList,
  formatSpellNamesChatMarkdown,
  inferMeshyResourceFocus,
  voiceClusterNameReply,
  voiceCountReply,
  voiceEmptyReply,
  voiceHealthSummary,
  voiceListOfferLine,
  voiceNodeCountReply,
  voiceVersionReply,
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

function tryMultiResourceAnswer(
  msg: string,
  ctx: MeshyClusterContext,
  voiceMode: boolean,
): string | null {
  const hasMultiCue =
    /\b(and|also|plus|,)\b/.test(msg) || /\btoo\s*$/i.test(msg.trim());
  if (!hasMultiCue) return null;

  const wantsNodes =
    /\bnodes?\b(?!pool|claim|class)/i.test(msg) &&
    (/\bhow many\b|\bnumber of\b|\bnode count\b|\bnodes?\s+in\s+(my\s+)?cluster\b/i.test(
      msg,
    ) ||
      /\bcount\b.*\bnodes?\b/i.test(msg));
  const wantsNodepools = /\bnodepools?\b|\bnode pools?\b/i.test(msg);

  if (wantsNodes && wantsNodepools) {
    if (voiceMode) {
      const nodeLine = voiceNodeCountReply(ctx.nodeCount, ctx.readyNodeCount);
      const poolLine =
        ctx.nodepoolCount === 0
          ? "I don't see any node pools on this cluster, Sir."
          : voiceCountReply("node pools", ctx.nodepoolCount);
      return `${nodeLine} Also, ${poolLine.charAt(0).toLowerCase()}${poolLine.slice(1)}`;
    }
    return `**Nodes:** **${ctx.nodeCount}** — **${ctx.readyNodeCount}** Ready.\n\n**NodePools:** **${ctx.nodepoolCount}** Karpenter NodePools (live API).${kubectlBlock("kubectl get nodepools")}`;
  }

  return null;
}

function spellResourceLabel(resource: string): string {
  switch (resource) {
    case "nodes":
      return "Node hostnames";
    case "pods":
      return "Pod names";
    case "namespaces":
      return "Namespace names";
    case "deployments":
      return "Deployment names";
    case "services":
      return "Service names";
    case "nodepools":
      return "Node pool names";
    case "nodeclaims":
      return "Node claim names";
    default:
      return "Names";
  }
}

function spellResourceNames(resource: string, ctx: MeshyClusterContext): string[] {
  switch (resource) {
    case "nodes":
      return ctx.nodes.map((node) => node.name);
    case "pods":
      return ctx.pods.map((pod) => `${pod.namespace}/${pod.name}`);
    case "namespaces":
      return ctx.namespaces;
    case "deployments":
      return ctx.deployments.map((item) => `${item.namespace}/${item.name}`);
    case "services":
      return ctx.services.map((item) => `${item.namespace}/${item.name}`);
    case "nodepools":
      return ctx.nodepools.map((item) => item.name);
    case "nodeclaims":
      return ctx.nodeclaims.map((item) => item.name);
    default:
      return [];
  }
}

function tryMeshySpellNamesChatAnswer(
  resource: string,
  ctx: MeshyClusterContext,
): string | null {
  const names = spellResourceNames(resource, ctx);
  const label = spellResourceLabel(resource);
  if (names.length === 0) {
    return `No ${label.toLowerCase()} found to spell.`;
  }
  return formatSpellNamesChatMarkdown(names, label);
}

export function tryMeshyDirectAnswer(
  message: string,
  ctx: MeshyClusterContext,
  clusterMeta: { name: string; contextName: string; serverUrl: string },
  voiceMode: boolean,
): string | null {
  const msg = message.toLowerCase().trim();

  const spellMatch = msg.match(
    /^spell (nodes|pods|deployments|services|namespaces|nodepools|nodeclaims) names$/,
  );
  if (spellMatch?.[1]) {
    if (voiceMode) return null;
    return tryMeshySpellNamesChatAnswer(spellMatch[1], ctx);
  }

  if (
    /\b(cluster name|name of (the |my )?cluster)\b/i.test(msg) ||
    /\bwhat('s| is) (the |my )?cluster (called|name)\b/i.test(msg)
  ) {
    return voiceMode
      ? voiceClusterNameReply(clusterMeta.name)
      : `Your connected cluster is **${clusterMeta.name}**.\n- Kubernetes: \`${ctx.version}\`\n- Context: \`${clusterMeta.contextName}\`\n- API server: \`${clusterMeta.serverUrl}\``;
  }

  if (/\b(kubernetes|k8s|cluster)\s+version\b/i.test(msg) || /\bwhat version\b/i.test(msg)) {
    return voiceMode
      ? voiceVersionReply(ctx.version)
      : `This cluster is running **Kubernetes ${ctx.version}** (from the API server).`;
  }

  const multiResource = tryMultiResourceAnswer(msg, ctx, voiceMode);
  if (multiResource) return multiResource;

  if (/\bhow many nodes\b|\bnode count\b|\bnumber of nodes\b/i.test(msg)) {
    return voiceMode
      ? voiceNodeCountReply(ctx.nodeCount, ctx.readyNodeCount)
      : `**${ctx.nodeCount}** nodes — **${ctx.readyNodeCount}** Ready, **${ctx.nodeCount - ctx.readyNodeCount}** not Ready (live API).${kubectlBlock("kubectl get nodes")}`;
  }

  if (/\b(list|show|get)\s+(the\s+)?nodes\b|\bwhat nodes\b/i.test(msg)) {
    if (ctx.nodes.length === 0) {
      return voiceMode
        ? voiceEmptyReply("nodes")
        : `The Kubernetes API returned no nodes.${kubectlBlock("kubectl get nodes")}`;
    }
    if (voiceMode) {
      return voiceListOfferLine("nodes");
    }
    return (
      `**Nodes in your cluster** (${ctx.nodes.length}):\n\n` +
      ctx.nodes
        .map((n) => `- **${n.name}** — *${n.status}*, roles: ${n.roles.join(", ")}`)
        .join("\n") + kubectlBlock("kubectl get nodes -o wide")
    );
  }

  if (/\bhow many namespaces\b|\bnamespace count\b/i.test(msg)) {
    return voiceMode
      ? voiceCountReply("namespaces", ctx.namespaces.length)
      : `**${ctx.namespaces.length}** namespaces.${kubectlBlock("kubectl get namespaces")}`;
  }

  if (
    /\b(list|show|get)\s+(the\s+)?namespaces?\b|\bwhat namespaces\b/i.test(msg)
  ) {
    if (ctx.namespaces.length === 0) {
      return voiceMode
        ? voiceEmptyReply("namespaces")
        : `No namespaces returned from the API.${kubectlBlock("kubectl get namespaces")}`;
    }
    return formatMeshyItemList(ctx.namespaces, {
      voiceMode,
      title: "namespaces",
      kubectl: "kubectl get namespaces",
    });
  }

  if (/\bhow many deployments\b|\bdeployment count\b/i.test(msg)) {
    return voiceMode
      ? voiceCountReply("deployments", ctx.deploymentCount)
      : `**${ctx.deploymentCount}** deployments (live API).${kubectlBlock("kubectl get deployments -A")}`;
  }

  if (/\bhow many services\b|\bservice count\b/i.test(msg)) {
    return voiceMode
      ? voiceCountReply("services", ctx.serviceCount)
      : `**${ctx.serviceCount}** services (live API).${kubectlBlock("kubectl get services -A")}`;
  }

  if (/\bhow many nodepools?\b|\bnodepool count\b|\bnumber of nodepools?\b/i.test(msg)) {
    if (ctx.nodepoolCount === 0) {
      return voiceMode
        ? "I don't see any Karpenter node pools — it may not be installed on this cluster."
        : `No **NodePools** returned from the API. If you use Karpenter, install the CRD or check RBAC.${kubectlBlock("kubectl get nodepools")}`;
    }
    return voiceMode
      ? voiceListOfferLine("node pools")
      : formatMeshyItemList(
          ctx.nodepools.map((np) => np.name),
          { title: "Karpenter NodePools", kubectl: "kubectl get nodepools" },
        );
  }

  if (/\b(list|show|get)\s+(the\s+)?nodepools?\b/i.test(msg)) {
    if (ctx.nodepoolCount === 0) {
      return voiceMode
        ? voiceEmptyReply("node pools")
        : `No **NodePools** found.${kubectlBlock("kubectl get nodepools")}`;
    }
    return voiceMode
      ? voiceListOfferLine("node pools")
      : ctx.nodepools
          .map((np) => `- **${np.name}**`)
          .join("\n") + kubectlBlock("kubectl get nodepools");
  }

  if (/\bhow many nodeclaims?\b|\bnodeclaim count\b|\bnumber of nodeclaims?\b/i.test(msg)) {
    if (ctx.nodeclaimCount === 0) {
      return voiceMode
        ? voiceEmptyReply("node claims")
        : `No **NodeClaims** returned from the API.${kubectlBlock("kubectl get nodeclaims")}`;
    }
    return voiceMode
      ? voiceCountReply("node claims", ctx.nodeclaimCount)
      : `**${ctx.nodeclaimCount}** Karpenter **NodeClaims** (live API).${kubectlBlock("kubectl get nodeclaims")}`;
  }

  if (/\b(list|show|get)\s+(the\s+)?nodeclaims?\b/i.test(msg)) {
    if (ctx.nodeclaimCount === 0) {
      return voiceMode
        ? voiceEmptyReply("node claims")
        : `No **NodeClaims** found.${kubectlBlock("kubectl get nodeclaims")}`;
    }
    return voiceMode
      ? voiceListOfferLine("node claims")
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
      ? voiceCountReply(
          "pods",
          ctx.podStats.total,
          ctx.podStats.unhealthy === 0
            ? "they all look healthy from what I can see"
            : `${ctx.podStats.unhealthy} look unhealthy right now`,
        )
      : `**${ctx.podStats.total}** pods — **${ctx.podStats.healthy}** healthy, **${ctx.podStats.unhealthy}** unhealthy.\n\n*Phases:* ${phases}.${kubectlBlock("kubectl get pods -A")}`;
  }

  if (
    /\b(cluster health|health of (the |my )?cluster|cluster status|health check|how healthy|overall health)\b/i.test(
      msg,
    ) ||
    /\bhow (is|are) (the |my )?cluster\b/i.test(msg)
  ) {
    return voiceMode
      ? voiceHealthSummary(
          clusterMeta.name,
          ctx.podStats.total,
          ctx.podStats.unhealthy,
          ctx.readyNodeCount,
          ctx.nodeCount,
        )
      : `**${clusterMeta.name}** status *(live API)*:\n- Kubernetes **${ctx.version}**\n- **${ctx.readyNodeCount}/${ctx.nodeCount}** nodes Ready\n- **${ctx.podStats.total}** pods (${ctx.podStats.healthy} healthy, ${ctx.podStats.unhealthy} unhealthy)\n- **${ctx.deploymentCount}** deployments, **${ctx.serviceCount}** services\n- *Pod phases:* ${formatPhaseBreakdown(ctx.podStats.byPhase)}${kubectlBlock("kubectl get nodes,pods -A --field-selector=status.phase!=Running")}`;
  }

  const focus = inferMeshyResourceFocus(message);
  if (focus) {
    if (focus === "cluster") {
      if (asksMeshyName(message) || msg.split(/\s+/).length <= 2) {
        return voiceMode
          ? voiceClusterNameReply(clusterMeta.name)
          : `Your connected cluster is **${clusterMeta.name}**.\n- Kubernetes: \`${ctx.version}\`\n- Context: \`${clusterMeta.contextName}\``;
      }
      if (/\bhealth\b/i.test(msg)) {
        return voiceMode
          ? voiceHealthSummary(
              clusterMeta.name,
              ctx.podStats.total,
              ctx.podStats.unhealthy,
              ctx.readyNodeCount,
              ctx.nodeCount,
            )
          : formatClusterHealthSummary(ctx, clusterMeta.name, false);
      }
    }

    if (focus === "nodes") {
      if (asksMeshyCount(message)) {
        return voiceMode
          ? voiceNodeCountReply(ctx.nodeCount, ctx.readyNodeCount)
          : `**${ctx.nodeCount}** nodes — **${ctx.readyNodeCount}** Ready.${kubectlBlock("kubectl get nodes")}`;
      }
      if (asksMeshyList(message) || msg.split(/\s+/).length <= 2) {
        if (ctx.nodes.length === 0) {
          return voiceMode
            ? voiceEmptyReply("nodes")
            : `No nodes returned.${kubectlBlock("kubectl get nodes")}`;
        }
        return voiceMode
          ? voiceListOfferLine("nodes")
          : `**Nodes in your cluster** (${ctx.nodes.length}):\n\n` +
              ctx.nodes
                .map((n) => `- **${n.name}** — *${n.status}*`)
                .join("\n") + kubectlBlock("kubectl get nodes");
      }
    }

    if (focus === "pods") {
      if (asksMeshyCount(message)) {
        return voiceMode
          ? voiceCountReply(
              "pods",
              ctx.podStats.total,
              ctx.podStats.unhealthy === 0
                ? "they all look healthy from what I can see"
                : `${ctx.podStats.unhealthy} look unhealthy right now`,
            )
          : `**${ctx.podStats.total}** pods — **${ctx.podStats.unhealthy}** unhealthy.${kubectlBlock("kubectl get pods -A")}`;
      }
      if (
        asksMeshyList(message) ||
        /\b(name|names)\b/i.test(msg)
      ) {
        if (ctx.pods.length === 0) {
          return voiceMode
            ? voiceEmptyReply("pods")
            : `No pods found.${kubectlBlock("kubectl get pods -A")}`;
        }
        if (voiceMode) {
          return voiceListOfferLine("pods");
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
        ? voiceCountReply("deployments", ctx.deploymentCount)
        : `**${ctx.deploymentCount}** deployments.${kubectlBlock("kubectl get deployments -A")}`;
    }

    if (focus === "services" && asksMeshyCount(message)) {
      return voiceMode
        ? voiceCountReply("services", ctx.serviceCount)
        : `**${ctx.serviceCount}** services.${kubectlBlock("kubectl get services -A")}`;
    }

    if (focus === "namespaces") {
      if (asksMeshyCount(message)) {
        return voiceMode
          ? voiceCountReply("namespaces", ctx.namespaces.length)
          : `**${ctx.namespaces.length}** namespaces.${kubectlBlock("kubectl get namespaces")}`;
      }
      if (asksMeshyList(message) || /\b(name|names)\b/i.test(msg)) {
        if (ctx.namespaces.length === 0) {
          return voiceMode
            ? voiceEmptyReply("namespaces")
            : `No namespaces found.${kubectlBlock("kubectl get namespaces")}`;
        }
        return formatMeshyItemList(ctx.namespaces, {
          voiceMode,
          title: "namespaces",
          kubectl: "kubectl get namespaces",
        });
      }
    }

    if (focus === "nodepools") {
      if (asksMeshyCount(message)) {
        return voiceMode
          ? voiceCountReply("node pools", ctx.nodepoolCount)
          : `**${ctx.nodepoolCount}** nodepools.${kubectlBlock("kubectl get nodepools")}`;
      }
      if (asksMeshyList(message) && ctx.nodepoolCount > 0) {
        return voiceMode
          ? voiceListOfferLine("node pools")
          : ctx.nodepools.map((np) => `- **${np.name}**`).join("\n");
      }
    }

    if (focus === "nodeclaims" && asksMeshyCount(message)) {
      return voiceMode
        ? voiceCountReply("node claims", ctx.nodeclaimCount)
        : `**${ctx.nodeclaimCount}** nodeclaims.${kubectlBlock("kubectl get nodeclaims")}`;
    }

    if (focus === "health") {
      return voiceMode
        ? voiceHealthSummary(
            clusterMeta.name,
            ctx.podStats.total,
            ctx.podStats.unhealthy,
            ctx.readyNodeCount,
            ctx.nodeCount,
          )
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
    ? voiceHealthSummary(
        clusterName,
        ctx.podStats.total,
        ctx.podStats.unhealthy,
        ctx.readyNodeCount,
        ctx.nodeCount,
      )
    : `**${clusterName}** — **${ctx.podStats.total}** pods (*${ctx.podStats.healthy}* healthy, *${ctx.podStats.unhealthy}* unhealthy), **${ctx.readyNodeCount}/${ctx.nodeCount}** nodes Ready, Kubernetes **${ctx.version}**.${kubectlBlock("kubectl get nodes,pods -A")}`;
}
