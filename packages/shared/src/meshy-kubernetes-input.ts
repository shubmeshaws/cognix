/** Normalize user input for Meshy — fix speech typos and expand Kubernetes/DevOps abbreviations. */

import {
  DEVOPS_ABBREVIATIONS,
  DEVOPS_CONTEXT_PATTERN,
  DEVOPS_HINT_PATTERN,
  DEVOPS_PHRASE_REPLACEMENTS,
  DEVOPS_RUN_TOGETHER_REPLACEMENTS,
  DEVOPS_SPELLING_REPLACEMENTS,
} from "./meshy-vocabulary.js";

export interface NormalizeKubernetesInputResult {
  normalized: string;
  corrections: string[];
}

function pushCorrection(corrections: string[], label: string, seen: Set<string>) {
  if (!label || seen.has(label)) return;
  seen.add(label);
  corrections.push(label);
}

function replaceAll(
  text: string,
  pattern: RegExp,
  replacement: string | ((...args: string[]) => string),
  correctionLabel: string,
  corrections: string[],
  seen: Set<string>,
): string {
  if (!pattern.test(text)) {
    pattern.lastIndex = 0;
    return text;
  }
  pattern.lastIndex = 0;
  pushCorrection(corrections, correctionLabel, seen);
  return text.replace(pattern, replacement as never);
}

function hasDevOpsContext(text: string): boolean {
  return DEVOPS_CONTEXT_PATTERN.test(text) || DEVOPS_HINT_PATTERN.test(text);
}

function fixNotesToNodes(
  text: string,
  corrections: string[],
  seen: Set<string>,
): string {
  let out = text;

  out = replaceAll(
    out,
    /\b(how many|list|show|get|count|all|the)\s+notes\b/gi,
    (_m, lead: string) => `${lead} nodes`,
    "notes → nodes",
    corrections,
    seen,
  );

  out = replaceAll(
    out,
    /\bnotes\s+(are|is|in|ready|status|down|up|failing|unhealthy)\b/gi,
    "nodes $1",
    "notes → nodes",
    corrections,
    seen,
  );

  out = replaceAll(
    out,
    /\bcluster\s+notes\b/gi,
    "cluster nodes",
    "notes → nodes",
    corrections,
    seen,
  );

  if (hasDevOpsContext(out)) {
    out = replaceAll(out, /\bnotes\b/gi, "nodes", "notes → nodes", corrections, seen);
  }

  if (hasDevOpsContext(out)) {
    out = replaceAll(out, /\bnods?\b/gi, "nodes", "nods → nodes", corrections, seen);
  }

  return out;
}

function fixPodsTypos(
  text: string,
  corrections: string[],
  seen: Set<string>,
): string {
  let out = text;

  const podSttToPods = (word: string, label: string) => {
    out = replaceAll(
      out,
      new RegExp(
        `\\b(number|count|how many)\\s+of\\s+(the\\s+)?${word}s?\\b`,
        "gi",
      ),
      "number of pods",
      label,
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      new RegExp(
        `\\b(list|show|get|count|all|my|unhealthy|failing|running|number)\\s+(?:of\\s+(?:the\\s+)?)?${word}s?\\b`,
        "gi",
      ),
      (_m, lead: string) => `${lead.trim()} pods`,
      label,
      corrections,
      seen,
    );
  };

  podSttToPods("pot", "pots → pods");
  podSttToPods("part", "parts → pods");
  podSttToPods("chord", "chords → pods");

  out = replaceAll(
    out,
    /\b(name|names)\s+of\s+(the\s+)?(parts|chords|pots|podes)\b/gi,
    "names of pods",
    "speech → pods",
    corrections,
    seen,
  );
  out = replaceAll(
    out,
    /\b(the\s+)?(parts|chords|pots|podes)\s+(are|is|in|running|failing|down|up|status|name|names)\b/gi,
    (_m, lead: string, _word: string, verb: string) =>
      `${lead ?? ""}pods ${verb}`.replace(/^\s+/, ""),
    "speech → pods",
    corrections,
    seen,
  );

  const listOrResourceCue =
    hasDevOpsContext(out) ||
    /\b(list|show|get|how many|count|name|names|cluster|kubernetes|kube|meshy|number of)\b/i.test(
      out,
    );
  if (listOrResourceCue) {
    out = replaceAll(out, /\bchords\b/gi, "pods", "chords → pods", corrections, seen);
    out = replaceAll(out, /\bchord\b/gi, "pod", "chord → pod", corrections, seen);
    out = replaceAll(out, /\bpots\b/gi, "pods", "pots → pods", corrections, seen);
    out = replaceAll(out, /\bpot\b/gi, "pod", "pot → pod", corrections, seen);
    out = replaceAll(out, /\bparts\b/gi, "pods", "parts → pods", corrections, seen);
    out = replaceAll(out, /\bpart\b/gi, "pod", "part → pod", corrections, seen);
    out = replaceAll(out, /\bpodes\b/gi, "pods", "podes → pods", corrections, seen);
    out = replaceAll(out, /\bpodd\b/gi, "pod", "podd → pod", corrections, seen);
  }

  return out;
}

/** STT often hears "nodes" as "node pulse", "north poles", "node polls", etc. */
function fixNodesSpeechHomophones(
  text: string,
  corrections: string[],
  seen: Set<string>,
): string {
  let out = text;

  const clusterCue =
    hasDevOpsContext(out) ||
    /\b(list|show|get|how many|count|number of|tell me|please|cluster|kubernetes|kube|meshy|my|down)\b/i.test(
      out,
    );

  const nodeMishearings = [
    "node pulse",
    "north pole",
    "node poll",
    "no pulse",
  ] as const;

  const applyNodeMishearing = (phrase: string, label: string) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const plural = `${escaped}(?:s|es)?`;

    out = replaceAll(
      out,
      new RegExp(`\\b(number|count|how many)\\s+of\\s+(the\\s+)?${plural}\\b`, "gi"),
      "number of nodes",
      label,
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      new RegExp(
        `\\b(list|show|get|count|all|my|tell me|please tell me)\\s+(?:down\\s+)?(?:the\\s+|of\\s+(?:the\\s+)?)?${plural}\\b`,
        "gi",
      ),
      (_m, lead: string) => `${lead.trim()} nodes`,
      label,
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      new RegExp(`\\b(the\\s+)?${plural}\\s+(are|is|in|ready|status|down|up|failing|unhealthy)\\b`, "gi"),
      (_m, lead: string, verb: string) =>
        `${lead ?? ""}nodes ${verb}`.replace(/^\s+/, ""),
      label,
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      new RegExp(`\\bcluster\\s+${plural}\\b`, "gi"),
      "cluster nodes",
      label,
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      new RegExp(`\\b${plural}\\s+in\\s+(my\\s+)?cluster\\b`, "gi"),
      "nodes in my cluster",
      label,
      corrections,
      seen,
    );
  };

  for (const phrase of nodeMishearings) {
    applyNodeMishearing(phrase, `${phrase} → nodes`);
  }

  if (clusterCue) {
    out = replaceAll(out, /\bnudes\b/gi, "nodes", "nudes → nodes", corrections, seen);
    out = replaceAll(
      out,
      /\bnudes\s+in\s+(my\s+)?cluster\b/gi,
      "nodes in my cluster",
      "nudes → nodes",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\bnode\s+pulses?\b/gi,
      "nodes",
      "node pulse → nodes",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\bnorth\s+poles?\b/gi,
      "nodes",
      "north poles → nodes",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\bnode\s+polls?\b/gi,
      "nodes",
      "node poll → nodes",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\bno\s+pulses?\b/gi,
      "nodes",
      "no pulse → nodes",
      corrections,
      seen,
    );
  }

  return out;
}

/** STT often hears "don't list them" as "don't listen". */
function fixDontListenHomophones(
  text: string,
  corrections: string[],
  seen: Set<string>,
): string {
  let out = text;

  out = replaceAll(
    out,
    /\b(don'?t|do not)\s+listen(?:\s+to)?\s+(them|those|it|the\s+list)\b/gi,
    (_m, lead: string, tail: string) => `${lead} list ${tail}`,
    "don't listen → don't list them",
    corrections,
    seen,
  );
  out = replaceAll(
    out,
    /\b(don'?t|do not)\s+listen\b/gi,
    "$1 list them",
    "don't listen → don't list them",
    corrections,
    seen,
  );

  return out;
}

/** STT often hears "please" as "police". */
function fixVoicePolitenessHomophones(
  text: string,
  corrections: string[],
  seen: Set<string>,
): string {
  let out = text;

  out = replaceAll(
    out,
    /\bpolice (list|tell|show|get|give|check|let|help|can you|could you)\b/gi,
    (_m, verb: string) => `please ${verb}`,
    "police → please",
    corrections,
    seen,
  );
  out = replaceAll(
    out,
    /^\s*police\b[,.]?\s*/i,
    "please ",
    "police → please",
    corrections,
    seen,
  );
  out = replaceAll(out, /\bpolice\b/gi, "please", "police → please", corrections, seen);

  return out;
}

/** STT often hears "node pools" as "note puls", "not pools", "no pulls", etc. */
function fixNodePoolSpeechHomophones(
  text: string,
  corrections: string[],
  seen: Set<string>,
): string {
  let out = text;

  const clusterCue =
    hasDevOpsContext(out) ||
    /\b(list|show|get|how many|count|number of|cluster|kubernetes|kube|meshy|my|karpenter|pool|pools|nodes?|also|too)\b/i.test(
      out,
    );

  if (!clusterCue) return out;

  const poolMishearings = [
    "note puls",
    "note pools",
    "note pool",
    "not pools",
    "not pool",
    "not puls",
    "node puls",
    "node pulls",
    "no pulls",
    "no pull",
    "know pools",
    "know pool",
    "knot pools",
    "knot pool",
    "north pools",
  ] as const;

  for (const phrase of poolMishearings) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = replaceAll(
      out,
      new RegExp(`\\b${escaped}(?:es)?\\b`, "gi"),
      "nodepools",
      `${phrase} → nodepools`,
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      new RegExp(
        `\\b(list|show|get|how many|count|number of|tell me|please)\\s+(?:the\\s+|about\\s+(?:the\\s+)?)?${escaped}(?:es)?\\b`,
        "gi",
      ),
      (_m, lead: string) => `${lead} nodepools`,
      `${phrase} → nodepools`,
      corrections,
      seen,
    );
  }

  out = replaceAll(
    out,
    /\b(nodepools|node pools|nodes|pods|namespaces)\s+to\s*$/gi,
    "$1 too",
    "to → too",
    corrections,
    seen,
  );

  return out;
}

/** Drop common STT lead-in noise before cluster questions. */
function stripVoiceLeadInFiller(
  text: string,
  corrections: string[],
  seen: Set<string>,
): string {
  const clusterCue =
    hasDevOpsContext(text) ||
    /\b(list|show|get|how many|count|number of|cluster|kubernetes|kube|nodes?|pods?)\b/i.test(
      text,
    );
  if (!clusterCue) return text;

  return replaceAll(
    text,
    /^\s*(chandan|sandan|tell me the|please tell me the|please tell me|tell me)\s+/i,
    "",
    "lead-in trimmed",
    corrections,
    seen,
  );
}

/** Speech homophones for cluster-specific resource names. */
function fixSpeechHomophones(
  text: string,
  corrections: string[],
  seen: Set<string>,
): string {
  let out = text;

  out = replaceAll(
    out,
    /\b(list|show|get|how many|count|any|the|my)\s+no\s+pools?\b/gi,
    (_m, lead: string) => `${lead} nodepools`,
    "no pools → nodepools",
    corrections,
    seen,
  );
  out = replaceAll(
    out,
    /\b(list|show|get|how many|count|any|the|my)\s+no\s+claims?\b/gi,
    (_m, lead: string) => `${lead} nodeclaims`,
    "no claims → nodeclaims",
    corrections,
    seen,
  );

  if (hasDevOpsContext(out)) {
    out = replaceAll(
      out,
      /\bno\s+pools?\b/gi,
      "nodepools",
      "no pools → nodepools",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\bno\s+claims?\b/gi,
      "nodeclaims",
      "no claims → nodeclaims",
      corrections,
      seen,
    );
  }

  out = replaceAll(
    out,
    /\bnodes?\s*pools?\b/gi,
    "nodepools",
    "node pool → nodepool",
    corrections,
    seen,
  );
  out = replaceAll(
    out,
    /\bnodes?\s*claims?\b/gi,
    "nodeclaims",
    "node claim → nodeclaim",
    corrections,
    seen,
  );
  out = replaceAll(
    out,
    /\bnodes?\s*classes?\b/gi,
    "nodeclasses",
    "node class → nodeclass",
    corrections,
    seen,
  );

  return out;
}

/** STT often hears "namespace(s)" as "species", "name spaces", etc. */
function fixNamespaceSpeechHomophones(
  text: string,
  corrections: string[],
  seen: Set<string>,
): string {
  let out = text;

  const clusterCue =
    hasDevOpsContext(out) ||
    /\b(list|show|get|how many|count|number of|name|names|cluster|kubernetes|kube|meshy)\b/i.test(
      out,
    );

  out = replaceAll(
    out,
    /\b(how many|count|number of|list|show|get|all|the|my)\s+(the\s+)?species\b/gi,
    (_m, lead: string) => `${lead} namespaces`,
    "species → namespaces",
    corrections,
    seen,
  );
  out = replaceAll(
    out,
    /\bnamespace\s+species\b/gi,
    "namespaces",
    "species → namespaces",
    corrections,
    seen,
  );
  out = replaceAll(
    out,
    /\b(name|names)\s+of\s+(the\s+)?species\b/gi,
    "names of namespaces",
    "species → namespaces",
    corrections,
    seen,
  );

  if (clusterCue) {
    out = replaceAll(out, /\bspecies\b/gi, "namespaces", "species → namespaces", corrections, seen);
    out = replaceAll(out, /\bspecie\b/gi, "namespace", "specie → namespace", corrections, seen);
  }

  return out;
}

/** STT often mishears EKS/AWS terms — only fix with cluster or AWS context. */
function fixAwsEksSpeechHomophones(
  text: string,
  corrections: string[],
  seen: Set<string>,
): string {
  let out = text;

  const awsCue =
    hasDevOpsContext(out) ||
    /\b(list|show|get|how many|count|cluster|kubernetes|kube|meshy|aws|amazon|deploy|upgrade|install|configure|check|what|which|my)\b/i.test(
      out,
    );

  if (awsCue) {
    out = replaceAll(
      out,
      /\bexcellent\s+(cluster|addons?|add-ons?|version|ctl|control plane)\b/gi,
      (_m, tail: string) => `eks ${tail}`,
      "excellent → eks",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\b(the\s+)?excellent\b/gi,
      "eks",
      "excellent → eks",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\bi\s+am\s+(role|roles|policy|policies|user|users|account|permissions?)\b/gi,
      (_m, noun: string) => `iam ${noun}`,
      "I am → IAM",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\badd\s+ons?\b/gi,
      "addons",
      "add on → addon",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\bnode\s+pool\b/gi,
      "nodepool",
      "node pool → nodepool",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\bnode\s+pools\b/gi,
      "nodepools",
      "node pools → nodepools",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\bsecurity\s+groups?\b/gi,
      (m) => (/\bs$/i.test(m) ? "securitygroups" : "securitygroup"),
      "security group → securitygroup",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\btarget\s+groups?\b/gi,
      (m) => (/\bs$/i.test(m) ? "targetgroups" : "targetgroup"),
      "target group → targetgroup",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\bauto\s+scaling\s+groups?\b/gi,
      (m) => (/\bs$/i.test(m) ? "autoscalinggroups" : "autoscalinggroup"),
      "auto scaling group → ASG",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\bload\s+balancer\s+controller\b/gi,
      "awsloadbalancercontroller",
      "load balancer controller",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\bpod\s+identity\b/gi,
      "podidentity",
      "pod identity",
      corrections,
      seen,
    );
    out = replaceAll(
      out,
      /\bvpc\s+cni\b/gi,
      "vpc-cni",
      "VPC CNI",
      corrections,
      seen,
    );
  }

  return out;
}

function applyReplacementRules(
  text: string,
  rules: ReadonlyArray<readonly [RegExp, string, string]>,
  corrections: string[],
  seen: Set<string>,
): string {
  let out = text;
  for (const [pattern, replacement, label] of rules) {
    out = replaceAll(out, pattern, replacement, label, corrections, seen);
  }
  return out;
}

function expandAbbreviations(
  text: string,
  corrections: string[],
  seen: Set<string>,
): string {
  if (!hasDevOpsContext(text)) {
    return text;
  }

  let out = applyReplacementRules(text, DEVOPS_ABBREVIATIONS, corrections, seen);

  out = replaceAll(
    out,
    /\brs\b/gi,
    "replicaset",
    "rs → replicaset",
    corrections,
    seen,
  );

  return out;
}

export function normalizeKubernetesInput(raw: string): NormalizeKubernetesInputResult {
  const corrections: string[] = [];
  const seen = new Set<string>();
  let text = raw.replace(/\s+/g, " ").trim();

  text = fixVoicePolitenessHomophones(text, corrections, seen);
  text = fixDontListenHomophones(text, corrections, seen);
  text = fixNotesToNodes(text, corrections, seen);
  text = fixNodePoolSpeechHomophones(text, corrections, seen);
  text = fixNodesSpeechHomophones(text, corrections, seen);
  text = fixPodsTypos(text, corrections, seen);
  text = stripVoiceLeadInFiller(text, corrections, seen);
  text = fixNamespaceSpeechHomophones(text, corrections, seen);
  text = fixSpeechHomophones(text, corrections, seen);
  text = fixAwsEksSpeechHomophones(text, corrections, seen);
  text = applyReplacementRules(text, DEVOPS_RUN_TOGETHER_REPLACEMENTS, corrections, seen);
  text = applyReplacementRules(text, DEVOPS_PHRASE_REPLACEMENTS, corrections, seen);
  text = applyReplacementRules(text, DEVOPS_SPELLING_REPLACEMENTS, corrections, seen);
  text = expandAbbreviations(text, corrections, seen);

  return {
    normalized: text.replace(/\s+/g, " ").trim(),
    corrections,
  };
}

export const MESHY_OFF_TOPIC_MESSAGE =
  "I'm **Meshy**, your Kubernetes and DevOps assistant. Ask about **pods**, **nodes**, **deployments**, **Helm**, **ingress**, **CI/CD**, cluster health, monitoring, or **kubectl** commands.";

export function meshyOffTopicMessage(voiceMode: boolean): string {
  if (voiceMode) {
    // Lazy import avoided — duplicate short message to keep bundle simple
    return "I'm best with Kubernetes and DevOps questions — try asking about pods, nodes, deployments, or cluster health.";
  }
  return MESHY_OFF_TOPIC_MESSAGE;
}

export {
  DEVOPS_TOPIC_TERMS,
  DEVOPS_ABBREVIATIONS,
  DEVOPS_PHRASE_REPLACEMENTS,
} from "./meshy-vocabulary.js";
