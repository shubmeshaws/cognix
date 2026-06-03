/** Multi-turn Meshy conversation — follow-ups, clarifications, yes/no confirmations. */

import {
  inferMeshyResourceFocus,
  type MeshyResourceFocus,
} from "./meshy-intent.js";
import { normalizeKubernetesInput } from "./meshy-kubernetes-input.js";
import {
  voiceCancelledReply,
  voiceClarifyList,
  voiceSureAck,
} from "./meshy-voice-style.js";

export type MeshyListResource = Exclude<
  MeshyResourceFocus,
  "health" | "cluster" | null
>;

export interface MeshyPendingListAction {
  type: "list";
  resource: MeshyListResource;
}

export type MeshyPendingAction = MeshyPendingListAction | MeshyPendingSpellOffer;

export interface MeshyPendingSpellOffer {
  type: "spell-offer";
  resource: MeshyListResource;
}

export type MeshyConversationResolution =
  | { kind: "continue"; message: string }
  | { kind: "clarify"; question: string; pendingAction: MeshyPendingAction }
  | { kind: "cancel"; message: string };

export interface MeshyHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

const AFFIRMATIVE =
  /^(yes|yeah|yep|yup|ya|sure|ok|okay|please|yes please|please yes|yes sir|correct|right|affirmative|go ahead|do it|absolutely|that'?s right|sounds good|please do)(\s+(please|sir))?[!.?\s]*$/i;

const NEGATIVE =
  /^(no|nope|nah|naah|no thanks|no thank you|not required|not needed|no please|cancel|stop|never mind|nevermind|not really|don'?t|skip)(\s+(please|thanks))?[!.?\s]*$/i;

const CLARIFY_PATTERN =
  /do you mean list (nodes|pods|deployments|services|namespaces|nodepools|nodeclaims)/i;

const SPELL_OFFER_PATTERN =
  /should i spell the list|spell the list for you|do you want me to spell the names/i;

const LIST_CUE =
  /\b(list down|list them|list it|list those|list out|can you list|could you list|please list|show them|show me the|give me the list|write down|display them|list all)\b/i;

function resourceLabel(resource: MeshyListResource): string {
  switch (resource) {
    case "nodes":
      return "nodes";
    case "pods":
      return "pods";
    case "deployments":
      return "deployments";
    case "services":
      return "services";
    case "namespaces":
      return "namespaces";
    case "nodepools":
      return "nodepools";
    case "nodeclaims":
      return "nodeclaims";
  }
}

function toListResource(focus: MeshyResourceFocus): MeshyListResource | null {
  if (
    focus === "nodes" ||
    focus === "pods" ||
    focus === "deployments" ||
    focus === "services" ||
    focus === "namespaces" ||
    focus === "nodepools" ||
    focus === "nodeclaims"
  ) {
    return focus;
  }
  return null;
}

export function isAffirmativeReply(text: string): boolean {
  return AFFIRMATIVE.test(text.trim());
}

export function isNegativeReply(text: string): boolean {
  return NEGATIVE.test(text.trim());
}

export function parsePendingClarification(
  assistantContent: string | undefined,
): MeshyPendingListAction | null {
  if (!assistantContent) return null;
  const match = assistantContent.match(CLARIFY_PATTERN);
  if (!match?.[1]) return null;
  const resource = match[1].toLowerCase() as MeshyListResource;
  return { type: "list", resource };
}

export function parsePendingSpellOffer(
  assistantContent: string | undefined,
): MeshyPendingSpellOffer | null {
  if (!assistantContent) return null;
  if (!SPELL_OFFER_PATTERN.test(assistantContent)) return null;
  const focus = inferFocusFromAssistantSummary(assistantContent);
  if (focus) return { type: "spell-offer", resource: focus };
  return null;
}

/** Infer resource focus from a short assistant summary (avoids list noise like the karpenter namespace). */
function inferFocusFromAssistantSummary(content: string): MeshyListResource | null {
  const head = content.split("\n").slice(0, 4).join(" ").toLowerCase();

  if (/\b\d+\s+namespaces?\b/.test(head) || /\bnamespace count\b/.test(head) ||
    /\bnamespaces?\s+in your cluster\b/.test(head) ||
    /\bhow many namespaces\b/.test(head) ||
    /\bthese are the namespaces\b/.test(head)
  ) {
    return "namespaces";
  }
  if (
    /\b\d+\s+nodes?\b/.test(head) ||
    /\bnode count\b/.test(head) ||
    /\bthese are the nodes\b/.test(head) ||
    /\bhere are some of the nodes\b/.test(head) ||
    /\bthese are the nodes list\b/.test(head) ||
    /\bshould i spell the list\b/.test(head)
  ) {
    return "nodes";
  }
  if (/\b\d+\s+pods?\b/.test(head) || /\bpod count\b/.test(head) || /\bthese are the pods\b/.test(head)) {
    return "pods";
  }
  if (/\b\d+\s+deployments?\b/.test(head)) return "deployments";
  if (/\b\d+\s+services?\b/.test(head)) return "services";
  if (/\b\d+\s+nodepools?\b/.test(head)) return "nodepools";
  if (/\b\d+\s+nodeclaims?\b/.test(head)) return "nodeclaims";

  return toListResource(inferMeshyResourceFocus(head));
}

/** Infer the resource the user was just discussing from recent turns. */
export function inferTopicFromHistory(
  history: MeshyHistoryTurn[],
): MeshyListResource | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== "user") continue;
    const focus = toListResource(inferMeshyResourceFocus(turn.content));
    if (focus) return focus;
    if (history.length - 1 - i > 4) break;
  }

  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== "assistant") continue;
    const focus = inferFocusFromAssistantSummary(turn.content);
    if (focus) return focus;
    if (history.length - 1 - i > 4) break;
  }

  return null;
}

/** Resolve "list them" / polite list phrasing to an explicit list command for direct answers. */
export function resolveListMessage(
  message: string,
  history: MeshyHistoryTurn[],
): string {
  const { normalized } = normalizeKubernetesInput(message);
  const explicitFocus = toListResource(inferMeshyResourceFocus(normalized));
  if (explicitFocus && /\b(list|show|get)\b/i.test(normalized)) {
    return `list ${resourceLabel(explicitFocus)}`;
  }
  if (
    isAmbiguousListRequest(normalized) ||
    /\b(list|show|get)\s+(them|those|it)\b/i.test(normalized)
  ) {
    const topic = inferTopicFromHistory(history);
    if (topic) return `list ${resourceLabel(topic)}`;
  }
  return normalized;
}

export function isDeclineListRequest(message: string): boolean {
  const { normalized } = normalizeKubernetesInput(message);
  return (
    /\b(don'?t|do not|no need to|stop|skip|cancel)\s+(list|listing)\b/i.test(
      normalized,
    ) ||
    /\b(don'?t|do not)\s+list\s+(them|those|it|the\s+list)\b/i.test(normalized)
  );
}

export function isAmbiguousListRequest(message: string): boolean {
  if (isDeclineListRequest(message)) return false;
  const { normalized } = normalizeKubernetesInput(message);
  const lower = normalized.toLowerCase();

  if (!/\b(list|show|display|give me)\b/i.test(lower)) return false;
  if (toListResource(inferMeshyResourceFocus(normalized))) return false;

  if (LIST_CUE.test(lower)) return true;

  const words = lower.split(/\s+/).filter(Boolean);
  return words.length <= 7 && /\b(list|show)\b/i.test(lower);
}

function actionToMessage(action: MeshyPendingAction): string {
  if (action.type === "list") {
    return `list ${resourceLabel(action.resource)}`;
  }
  return "";
}

export function buildClarificationQuestion(
  action: MeshyPendingAction,
  voiceMode: boolean,
): string {
  if (action.type === "list") {
    const label = resourceLabel(action.resource);
    return voiceMode
      ? voiceClarifyList(label)
      : `Do you mean **list ${label}**? Reply **yes** or **no**.`;
  }
  return voiceMode
    ? "Could you say a bit more about what you'd like to know?"
    : "Could you clarify what you mean?";
}

export function resolveMeshyConversationTurn(
  message: string,
  history: MeshyHistoryTurn[],
  voiceMode: boolean,
): MeshyConversationResolution {
  const { normalized } = normalizeKubernetesInput(message);

  if (isDeclineListRequest(normalized)) {
    return {
      kind: "cancel",
      message: voiceMode ? voiceSureAck() : "Okay, I won't list them.",
    };
  }

  const lastAssistant = [...history].reverse().find((h) => h.role === "assistant");
  const pendingSpell = parsePendingSpellOffer(lastAssistant?.content);

  if (pendingSpell) {
    if (isNegativeReply(normalized)) {
      return { kind: "cancel", message: voiceSureAck() };
    }
    if (isAffirmativeReply(normalized)) {
      return {
        kind: "continue",
        message: `spell ${pendingSpell.resource} names`,
      };
    }
  }

  const pending = parsePendingClarification(lastAssistant?.content);

  if (pending) {
    if (isNegativeReply(normalized)) {
      return {
        kind: "cancel",
        message: voiceMode ? voiceCancelledReply() : "Okay, cancelled. What else can I help with?",
      };
    }
    if (isAffirmativeReply(normalized)) {
      return { kind: "continue", message: actionToMessage(pending) };
    }
  }

  if (isAmbiguousListRequest(normalized)) {
    const topic = inferTopicFromHistory(history);
    if (topic) {
      return { kind: "continue", message: actionToMessage({ type: "list", resource: topic }) };
    }
  }

  return { kind: "continue", message: normalized };
}
