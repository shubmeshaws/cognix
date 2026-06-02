/** Multi-turn Meshy conversation — follow-ups, clarifications, yes/no confirmations. */

import {
  inferMeshyResourceFocus,
  type MeshyResourceFocus,
} from "./meshy-intent.js";
import { normalizeKubernetesInput } from "./meshy-kubernetes-input.js";

export type MeshyListResource = Exclude<
  MeshyResourceFocus,
  "health" | "cluster" | null
>;

export interface MeshyPendingListAction {
  type: "list";
  resource: MeshyListResource;
}

export type MeshyPendingAction = MeshyPendingListAction;

export type MeshyConversationResolution =
  | { kind: "continue"; message: string }
  | { kind: "clarify"; question: string; pendingAction: MeshyPendingAction }
  | { kind: "cancel"; message: string };

export interface MeshyHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

const AFFIRMATIVE =
  /^(yes|yeah|yep|yup|sure|ok|okay|please|correct|right|affirmative|go ahead|do it|absolutely|that'?s right|sounds good|please do)[!.?\s]*$/i;

const NEGATIVE =
  /^(no|nope|nah|cancel|stop|never mind|nevermind|not really|don'?t|skip)[!.?\s]*$/i;

const CLARIFY_PATTERN =
  /do you mean list (nodes|pods|deployments|services|namespaces|nodepools|nodeclaims)/i;

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
): MeshyPendingAction | null {
  if (!assistantContent) return null;
  const match = assistantContent.match(CLARIFY_PATTERN);
  if (!match?.[1]) return null;
  const resource = match[1].toLowerCase() as MeshyListResource;
  return { type: "list", resource };
}

/** Infer the resource the user was just discussing from recent turns. */
export function inferTopicFromHistory(
  history: MeshyHistoryTurn[],
): MeshyListResource | null {
  const recent = history
    .slice(-8)
    .map((h) => h.content)
    .join(" ");
  return toListResource(inferMeshyResourceFocus(recent));
}

export function isAmbiguousListRequest(message: string): boolean {
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
      ? `Do you mean list ${label}? Say yes or no.`
      : `Do you mean **list ${label}**? Reply **yes** or **no**.`;
  }
  return voiceMode ? "Could you clarify?" : "Could you clarify what you mean?";
}

export function resolveMeshyConversationTurn(
  message: string,
  history: MeshyHistoryTurn[],
  voiceMode: boolean,
): MeshyConversationResolution {
  const { normalized } = normalizeKubernetesInput(message);

  const lastAssistant = [...history].reverse().find((h) => h.role === "assistant");
  const pending = parsePendingClarification(lastAssistant?.content);

  if (pending) {
    if (isAffirmativeReply(normalized)) {
      return { kind: "continue", message: actionToMessage(pending) };
    }
    if (isNegativeReply(normalized)) {
      return {
        kind: "cancel",
        message: voiceMode
          ? "Okay, cancelled. What else can I help with?"
          : "Okay, cancelled. What else can I help with?",
      };
    }
  }

  if (isAmbiguousListRequest(normalized)) {
    const topic = inferTopicFromHistory(history);
    if (topic) {
      const pendingAction: MeshyPendingAction = { type: "list", resource: topic };
      return {
        kind: "clarify",
        question: buildClarificationQuestion(pendingAction, voiceMode),
        pendingAction,
      };
    }
  }

  return { kind: "continue", message: normalized };
}
