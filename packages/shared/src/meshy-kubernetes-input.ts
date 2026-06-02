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

  text = fixNotesToNodes(text, corrections, seen);
  text = fixPodsTypos(text, corrections, seen);
  text = fixSpeechHomophones(text, corrections, seen);
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
  return voiceMode
    ? "Please ask a Kubernetes or DevOps question — pods, nodes, deployments, Helm, CI/CD, or cluster health."
    : MESHY_OFF_TOPIC_MESSAGE;
}

export {
  DEVOPS_TOPIC_TERMS,
  DEVOPS_ABBREVIATIONS,
  DEVOPS_PHRASE_REPLACEMENTS,
} from "./meshy-vocabulary.js";
