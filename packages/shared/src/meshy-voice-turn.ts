/** Multi-utterance voice turn scripts for Meshy (ack → answer → follow-up). */

import { asksMeshyCount, asksMeshyList, inferMeshyResourceFocus } from "./meshy-intent.js";
import type { MeshyHistoryTurn, MeshyListResource } from "./meshy-conversation.js";
import {
  inferTopicFromHistory,
  isAmbiguousListRequest,
  type MeshyConversationResolution,
} from "./meshy-conversation.js";
import {
  voiceCountReply,
  voiceEmptyReply,
  voiceListOfferLine,
  voiceListTurnScript,
  voiceNodeCountReply,
  hasVoiceSpellOffer,
  splitListOfferVoiceScript,
  voiceSpellNamesScript,
} from "./meshy-voice-style.js";

type VoiceAckIntent = "list" | "count" | "health" | "spell" | "general";

const LIST_ACKS = [
  "Okay Sir, listing them.",
  "Sure Sir, listing them now.",
  "Got it Sir, pulling that list up.",
  "Alright Sir, let me list those for you.",
];

const COUNT_ACKS = [
  "Okay Sir, give me a moment, I'm checking.",
  "Sure Sir, let me check that for you.",
  "One moment Sir, I'm looking that up.",
  "Alright Sir, give me a second.",
];

const HEALTH_ACKS = [
  "Okay Sir, let me check cluster health.",
  "Sure Sir, reviewing health for you.",
  "One moment Sir, checking how things look.",
];

const SPELL_ACKS = [
  "Sure Sir, spelling them now.",
  "Okay Sir, here are the names spelled out.",
  "Alright Sir, let me spell those for you.",
];

const GENERAL_ACKS = [
  "Okay Sir, give me a moment.",
  "Sure Sir, one moment please.",
  "Alright Sir, let me check on that.",
  "Got it Sir, give me a second.",
];

function pickVariant(options: string[], seed: number): string {
  return options[Math.abs(seed) % options.length]!;
}

function isListIntent(message: string, history: MeshyHistoryTurn[]): boolean {
  const msg = message.toLowerCase();
  if (
    /\b(don'?t|do not|no need to|stop|skip|cancel)\s+(list|listing)\b/i.test(msg) ||
    /\b(don'?t|do not)\s+list\s+(them|those|it)\b/i.test(msg)
  ) {
    return false;
  }
  if (asksMeshyList(message) && inferMeshyResourceFocus(message)) return true;
  if (/\b(list them|list it|list those|list down|list out|can you list|please list)\b/i.test(msg)) {
    return true;
  }
  if (isAmbiguousListRequest(message) && inferTopicFromHistory(history)) return true;
  return false;
}

function inferVoiceAckIntent(message: string, history: MeshyHistoryTurn[]): VoiceAckIntent {
  if (/^spell (nodes|pods|deployments|services|namespaces|nodepools|nodeclaims) names$/i.test(message)) {
    return "spell";
  }
  if (isListIntent(message, history)) return "list";
  if (asksMeshyCount(message) || /\bhow many\b|\bnumber of\b|\bcount\b/i.test(message)) {
    return "count";
  }
  if (/\bhealth\b|\bhow (is|are) (the |my )?cluster\b/i.test(message)) return "health";
  return "general";
}

/** Context-aware pre-fetch ack — varied wording based on what the user asked. */
export function voiceWorkingAck(
  message: string,
  options?: { turnIndex?: number; history?: MeshyHistoryTurn[] },
): string {
  const history = options?.history ?? [];
  const seed = (options?.turnIndex ?? 0) * 7 + message.length + history.length;
  const intent = inferVoiceAckIntent(message, history);

  switch (intent) {
    case "list":
      return pickVariant(LIST_ACKS, seed);
    case "count":
      return pickVariant(COUNT_ACKS, seed + 1);
    case "health":
      return pickVariant(HEALTH_ACKS, seed + 2);
    case "spell":
      return pickVariant(SPELL_ACKS, seed + 3);
    default:
      return pickVariant(GENERAL_ACKS, seed + 4);
  }
}

export interface MeshyVoiceScriptContext {
  nodeCount: number;
  readyNodeCount: number;
  namespaces: string[];
  nodes: Array<{ name: string; status: string }>;
  pods: Array<{ namespace: string; name: string }>;
  deploymentCount: number;
  serviceCount: number;
  nodepools: Array<{ name: string }>;
  nodeclaims: Array<{ name: string }>;
  podStats: { total: number; unhealthy: number };
}

function resourceNames(
  resource: MeshyListResource,
  ctx: MeshyVoiceScriptContext,
): string[] {
  switch (resource) {
    case "nodes":
      return ctx.nodes.map((n) => n.name);
    case "pods":
      return ctx.pods.map((p) => `${p.namespace}/${p.name}`);
    case "namespaces":
      return ctx.namespaces;
    case "deployments":
      return [];
    case "services":
      return [];
    case "nodepools":
      return ctx.nodepools.map((np) => np.name);
    case "nodeclaims":
      return ctx.nodeclaims.map((nc) => nc.name);
  }
}

function resourceLabel(resource: MeshyListResource): string {
  switch (resource) {
    case "nodes":
      return "nodes";
    case "pods":
      return "pods";
    case "namespaces":
      return "namespaces";
    case "deployments":
      return "deployments";
    case "services":
      return "services";
    case "nodepools":
      return "node pools";
    case "nodeclaims":
      return "node claims";
  }
}

function countVoiceLine(message: string, ctx: MeshyVoiceScriptContext): string | null {
  const msg = message.toLowerCase();

  if (/\bhow many nodes\b|\bnode count\b|\bnumber of nodes\b/i.test(msg)) {
    return voiceNodeCountReply(ctx.nodeCount, ctx.readyNodeCount);
  }
  if (/\bhow many namespaces\b|\bnamespace count\b/i.test(msg)) {
    return voiceCountReply("namespaces", ctx.namespaces.length);
  }
  if (/\bhow many deployments\b|\bdeployment count\b/i.test(msg)) {
    return voiceCountReply("deployments", ctx.deploymentCount);
  }
  if (/\bhow many services\b|\bservice count\b/i.test(msg)) {
    return voiceCountReply("services", ctx.serviceCount);
  }
  if (/\bhow many nodepools?\b|\bnodepool count\b/i.test(msg)) {
    return voiceCountReply("node pools", ctx.nodepools.length);
  }
  if (/\bhow many nodeclaims?\b|\bnodeclaim count\b/i.test(msg)) {
    return voiceCountReply("node claims", ctx.nodeclaims.length);
  }
  if (/\bhow many pods\b|\bpod count\b|\bnumber of pods\b/i.test(msg)) {
    return voiceCountReply(
      "pods",
      ctx.podStats.total,
      ctx.podStats.unhealthy === 0
        ? "they all look healthy from what I can see"
        : `${ctx.podStats.unhealthy} look unhealthy right now`,
    );
  }

  const focus = inferMeshyResourceFocus(message);
  if (focus === "nodes" && asksMeshyCount(message)) {
    return voiceNodeCountReply(ctx.nodeCount, ctx.readyNodeCount);
  }
  if (focus === "namespaces" && asksMeshyCount(message)) {
    return voiceCountReply("namespaces", ctx.namespaces.length);
  }
  if (focus === "pods" && asksMeshyCount(message)) {
    return voiceCountReply(
      "pods",
      ctx.podStats.total,
      ctx.podStats.unhealthy === 0
        ? "they all look healthy from what I can see"
        : `${ctx.podStats.unhealthy} look unhealthy right now`,
    );
  }
  if (focus === "deployments" && asksMeshyCount(message)) {
    return voiceCountReply("deployments", ctx.deploymentCount);
  }
  if (focus === "services" && asksMeshyCount(message)) {
    return voiceCountReply("services", ctx.serviceCount);
  }
  if (focus === "nodepools" && asksMeshyCount(message)) {
    return voiceCountReply("node pools", ctx.nodepools.length);
  }
  if (focus === "nodeclaims" && asksMeshyCount(message)) {
    return voiceCountReply("node claims", ctx.nodeclaims.length);
  }

  return null;
}

function resolveListResource(
  message: string,
  history: MeshyHistoryTurn[],
): MeshyListResource | null {
  const focus = inferMeshyResourceFocus(message);
  if (focus && focus !== "cluster" && focus !== "health") {
    return focus as MeshyListResource;
  }
  if (isListIntent(message, history)) {
    return inferTopicFromHistory(history);
  }
  return null;
}

function listVoiceScript(
  message: string,
  history: MeshyHistoryTurn[],
  ctx: MeshyVoiceScriptContext,
): string[] | null {
  if (!isListIntent(message, history)) return null;

  const resource = resolveListResource(message, history);
  if (!resource) return null;

  const names = resourceNames(resource, ctx);
  if (names.length === 0) {
    return [voiceEmptyReply(resourceLabel(resource))];
  }
  return voiceListTurnScript(resourceLabel(resource), names);
}

export function ensureVoiceListSpellOffer(
  message: string,
  history: MeshyHistoryTurn[],
  voiceScript: string[],
): string[] {
  const split = splitListOfferVoiceScript(voiceScript);

  if (!isListIntent(message, history)) return split;
  if (split.some((line) => hasVoiceSpellOffer(line))) return split;

  const resource = resolveListResource(message, history);
  if (!resource) return split;

  return voiceListTurnScript(resourceLabel(resource), []);
}

const SPELL_NAMES_PATTERN =
  /^spell (nodes|pods|deployments|services|namespaces|nodepools|nodeclaims) names$/i;

export function buildMeshyVoiceScript(input: {
  message: string;
  voiceAnswer: string;
  conversation: MeshyConversationResolution;
  history?: MeshyHistoryTurn[];
  ctx: MeshyVoiceScriptContext;
}): string[] {
  const { message, voiceAnswer, conversation, ctx } = input;
  const history = input.history ?? [];

  if (conversation.kind === "cancel") {
    return [conversation.message];
  }
  if (conversation.kind === "clarify") {
    return [conversation.question];
  }

  const spellMatch = message.match(SPELL_NAMES_PATTERN);
  if (spellMatch?.[1]) {
    const resource = spellMatch[1].toLowerCase() as MeshyListResource;
    const names = resourceNames(resource, ctx);
    if (names.length === 0) {
      return [voiceEmptyReply(resourceLabel(resource))];
    }
    return voiceSpellNamesScript(names);
  }

  const listScript = listVoiceScript(message, history, ctx);
  if (listScript) return listScript;

  const countLine = countVoiceLine(message, ctx);
  if (countLine) return [countLine];

  const listOffer = ensureVoiceListSpellOffer(message, history, []);
  if (listOffer.some((line) => hasVoiceSpellOffer(line))) {
    return listOffer;
  }

  if (voiceAnswer.trim()) return [voiceAnswer.trim()];
  return ["Sure."];
}

/** Play before cluster API lookup — not part of the stored assistant reply. */
export function shouldPlayVoiceCheckingAck(
  conversation: MeshyConversationResolution,
  isShortFollowUp: boolean,
): boolean {
  if (isShortFollowUp) return false;
  if (conversation.kind === "cancel" || conversation.kind === "clarify") return false;
  return true;
}
