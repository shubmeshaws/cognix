export {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_LLM_CHAIN,
  DEFAULT_PUTER_MODEL,
  isLegacyDefaultLlmChain,
  LLM_CHAIN_SLOT_LABELS,
  LLM_PROVIDER_CATALOG,
  normalizeLlmChain,
  compactLlmChain,
  type LlmChainSlotLabel,
  type LlmProviderChain,
  type LlmProviderId,
} from "./llm-providers.js";

export type PodPhase =
  | "Pending"
  | "Running"
  | "Succeeded"
  | "Failed"
  | "Unknown";

export interface Pod {
  id: string;
  clusterId: string;
  namespace: string;
  name: string;
  phase: PodPhase;
  nodeName?: string;
  restartCount: number;
  ready: boolean;
  labels: Record<string, string>;
  createdAt: string;
  lastSeenAt: string;
}

export type HealStatus = "pending" | "approved" | "rejected" | "applied" | "failed";

export interface HealRecord {
  id: string;
  clusterId: string;
  podId: string;
  namespace: string;
  podName: string;
  issueSummary: string;
  diagnosis: string;
  proposedAction: string;
  llmModel: string;
  llmReasoning: string;
  status: HealStatus;
  requiresHumanApproval: boolean;
  appliedAt?: string;
  createdAt: string;
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertEvent {
  id: string;
  clusterId: string;
  podId?: string;
  namespace?: string;
  podName?: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  source: string;
  acknowledged: boolean;
  createdAt: string;
}

export type TerminalStream = "stdout" | "stderr" | "system";

export interface TerminalLine {
  id: string;
  sessionId: string;
  clusterId: string;
  stream: TerminalStream;
  content: string;
  timestamp: string;
}

export type {
  HealRuleCategory,
  HealRuleDefinition,
  HealRuleId,
  HealRuleMode,
  HealRuleSectionDefinition,
} from "./heal-rules.js";
export {
  ALL_HEAL_RULE_IDS,
  approvalHealRulesFromModes,
  buildHealRulesState,
  DEFAULT_ENABLED_HEAL_RULES,
  groupHealRulesByCategory,
  HEAL_RULE_CATALOG,
  HEAL_RULE_SECTIONS,
  healRuleRequiresApproval,
  healRulesFromState,
  normalizeHealRuleIds,
  normalizeHealRuleModes,
} from "./heal-rules.js";

export {
  formatHostnameForSpeech,
  formatHostnamesForSpeech,
} from "./meshy-hostname-speech.js";

export {
  formatMeshyCommaListReply,
  formatMeshyItemList,
  type MeshyItemListOptions,
} from "./meshy-format.js";

export {
  MESHY_VOICE_SYSTEM_STYLE,
  naturalJoin,
  voiceCancelledReply,
  voiceCheckingAck,
  voiceClarifyList,
  voiceClusterNameReply,
  voiceCountReply,
  voiceEmptyReply,
  voiceHealthSummary,
  hasVoiceSpellOffer,
  voiceListOfferLine,
  voiceListReply,
  voiceListTurnScript,
  voiceNodeCountReply,
  voiceOffTopicMessage,
  splitListOfferVoiceScript,
  formatSpellNamesChatMarkdown,
  voiceSpellNamesReply,
  voiceSpellNamesScript,
  voiceSpellOffer,
  voiceSureAck,
  voiceVersionReply,
} from "./meshy-voice-style.js";

export {
  buildMeshyVoiceScript,
  ensureVoiceListSpellOffer,
  shouldPlayVoiceCheckingAck,
  voiceWorkingAck,
  type MeshyVoiceScriptContext,
} from "./meshy-voice-turn.js";

export {
  DEVOPS_ABBREVIATIONS,
  DEVOPS_PHRASE_REPLACEMENTS,
  DEVOPS_TOPIC_TERMS,
  meshyOffTopicMessage,
  MESHY_OFF_TOPIC_MESSAGE,
  normalizeKubernetesInput,
  type NormalizeKubernetesInputResult,
} from "./meshy-kubernetes-input.js";

export {
  asksMeshyCount,
  asksMeshyList,
  asksMeshyName,
  buildMeshyIntentHint,
  findMatchedDevOpsTerms,
  inferMeshyResourceFocus,
  isExplicitPodListRequest,
  isKubernetesRelated,
  type MeshyResourceFocus,
} from "./meshy-intent.js";

export {
  buildClarificationQuestion,
  inferTopicFromHistory,
  isAffirmativeReply,
  isAmbiguousListRequest,
  isDeclineListRequest,
  isNegativeReply,
  parsePendingClarification,
  parsePendingSpellOffer,
  resolveListMessage,
  resolveMeshyConversationTurn,
  type MeshyConversationResolution,
  type MeshyHistoryTurn,
  type MeshyListResource,
  type MeshyPendingAction,
} from "./meshy-conversation.js";

export type ClusterAuthMode = "kubeconfig" | "in_cluster";

export interface ClusterConfig {
  id: string;
  name: string;
  /** Base64-encoded kubeconfig YAML (user upload). Tried first on connect. */
  kubeconfigBase64?: string;
  /** Use in-cluster service account credentials when true. */
  inCluster?: boolean;
  authMode?: ClusterAuthMode;
  context?: string;
  /** null/undefined = all namespaces */
  namespaceFilter?: string[];
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
