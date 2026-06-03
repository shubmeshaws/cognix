/** Fuzzy intent inference for imperfect speech-to-text and typos. */

import { DEVOPS_TOPIC_TERMS } from "./meshy-vocabulary.js";
import { normalizeKubernetesInput } from "./meshy-kubernetes-input.js";

const GREETING =
  /^(hi|hello|hey|thanks|thank you|good morning|good afternoon|good evening|yo|sup)\b[!.,?\s]*$/i;

const QUESTION_CUE =
  /\b(how|what|why|when|where|who|which|tell me|show me|show|list|get|give me|can you|could you|please|is there|are there|do i|does|count|check|any|status|health|name|called|many|much|number of|total)\b/i;

export type MeshyResourceFocus =
  | "cluster"
  | "pods"
  | "nodes"
  | "deployments"
  | "services"
  | "namespaces"
  | "nodepools"
  | "nodeclaims"
  | "health"
  | null;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => {
      if (["parts", "pots", "podes", "chords"].includes(t)) return "pods";
      if (["part", "pot", "podd", "chord"].includes(t)) return "pod";
      if (t === "species") return "namespaces";
      if (t === "specie") return "namespace";
      if (t === "notes") return "nodes";
      if (t === "nods") return "nodes";
      return t;
    });
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return row[n]!;
}

function fuzzyTokenMatchesTerm(token: string, term: string): boolean {
  const tok = token.replace(/-/g, "");
  const t = term.toLowerCase().replace(/\s+/g, "");
  if (!tok || !t) return false;

  if (tok === t || t.includes(tok) || tok.includes(t)) return true;

  if (tok.length >= 4 && t.startsWith(tok) && tok.length >= t.length * 0.5) return true;
  if (t.length >= 4 && tok.startsWith(t) && t.length >= tok.length * 0.5) return true;

  const maxLen = Math.max(tok.length, t.length);
  if (maxLen < 4) return false;

  const maxEdits = maxLen <= 5 ? 1 : maxLen <= 8 ? 2 : 3;
  return levenshtein(tok, t) <= maxEdits;
}

/** DevOps/K8s terms loosely matched in user text (handles STT typos). */
export function findMatchedDevOpsTerms(text: string): string[] {
  const tokens = tokenize(text);
  const matches = new Set<string>();

  for (const token of tokens) {
    for (const term of DEVOPS_TOPIC_TERMS) {
      if (fuzzyTokenMatchesTerm(token, term)) {
        matches.add(term);
      }
    }
  }

  return [...matches];
}

function hasTopicPattern(text: string): boolean {
  const parts = DEVOPS_TOPIC_TERMS.map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(${parts.join("|")})\\b`, "i").test(text);
}

export function isKubernetesRelated(
  text: string,
  options?: { voiceMode?: boolean },
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (GREETING.test(trimmed)) return true;

  const { normalized } = normalizeKubernetesInput(trimmed);
  if (hasTopicPattern(normalized)) return true;

  const fuzzyMatches = findMatchedDevOpsTerms(normalized);
  if (fuzzyMatches.length > 0) return true;

  // Voice: short questions with any cue are likely cluster-related in Meshy.
  if (options?.voiceMode) {
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length >= 1 && QUESTION_CUE.test(trimmed)) return true;
    if (words.length <= 4 && fuzzyMatches.length === 0) {
      const loose = findMatchedDevOpsTerms(trimmed);
      if (loose.length > 0) return true;
    }
  }

  return false;
}

export function inferMeshyResourceFocus(message: string): MeshyResourceFocus {
  const { normalized } = normalizeKubernetesInput(message);
  const lower = normalized.toLowerCase();

  if (/\b(health|healthy|unhealthy|status)\b/i.test(lower)) return "health";
  if (/\bnamespaces?\b/i.test(lower)) return "namespaces";
  if (/\b(nodepool|nodepools)\b/i.test(lower)) return "nodepools";
  if (/\bkarpenter\b/i.test(lower) && /\b(pool|nodepool|provisioner|autoscal)\b/i.test(lower)) {
    return "nodepools";
  }
  if (/\b(nodeclaim|nodeclaims)\b/i.test(lower)) return "nodeclaims";
  if (/\bpod(?!cast|disruption|security)s?\b/i.test(lower)) return "pods";
  if (/\bnode(?!pool|claim|class|lease|port|s?pace)s?\b/i.test(lower)) return "nodes";
  if (/\bdeployments?\b/i.test(lower)) return "deployments";
  if (/\bservices?\b/i.test(lower)) return "services";
  if (/\b(cluster|kubernetes|k8s|kube)\b/i.test(lower)) return "cluster";

  const matched = findMatchedDevOpsTerms(normalized);
  const has = (...needles: string[]) =>
    matched.some((term) => needles.some((n) => term.includes(n) || term === n));

  if (has("namespace", "namespaces")) return "namespaces";
  if (has("nodepool", "nodepools")) return "nodepools";
  if (has("nodeclaim", "nodeclaims")) return "nodeclaims";
  if (has("deployment", "deployments")) return "deployments";
  if (has("service", "services")) return "services";
  if (has("node", "nodes")) return "nodes";
  if (has("pod", "pods")) return "pods";
  if (has("cluster", "kubernetes", "k8s", "kube")) return "cluster";

  return null;
}

export function buildMeshyIntentHint(
  message: string,
  rawMessage?: string,
): string {
  const raw = (rawMessage ?? message).trim();
  const { normalized, corrections } = normalizeKubernetesInput(raw);
  const matched = findMatchedDevOpsTerms(normalized);
  const focus = inferMeshyResourceFocus(raw);

  const parts: string[] = [];
  if (rawMessage && rawMessage.trim() !== normalized) {
    parts.push(`Heard: "${rawMessage.trim()}". Interpreted as: "${normalized}".`);
  }
  if (corrections.length > 0) {
    parts.push(`Speech corrections: ${corrections.join("; ")}.`);
  }
  if (matched.length > 0) {
    parts.push(`Likely topics: ${matched.slice(0, 8).join(", ")}.`);
  }
  if (focus) {
    parts.push(`Inferred focus: ${focus}.`);
  }
  parts.push(
    "The user message may be imperfect speech-to-text — infer intent from the whole sentence, not exact spelling.",
  );

  return parts.join(" ");
}

export function isExplicitPodListRequest(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    /\b(scan|check)\s+(the\s+)?cluster\b/i.test(msg) ||
    /\b(list|show|get|scan)\s+(me\s+)?(all\s+)?(the\s+)?(pods|unhealthy|failing)\b/i.test(
      msg,
    ) ||
    /\b(list|show|get)\s+(the\s+)?(name|names)\s+of\s+(the\s+)?pods\b/i.test(msg) ||
    /\b(which|what)\s+pods\b/i.test(msg) ||
    /\bunhealthy pods\b/i.test(msg) ||
    /\bfailing pods\b/i.test(msg)
  );
}

export function asksMeshyCount(message: string): boolean {
  return /\b(how many|how much|count|number of|total)\b/i.test(message);
}

export function asksMeshyList(message: string): boolean {
  return /\b(list|show|get|what are|tell me|display)\b/i.test(message);
}

export function asksMeshyName(message: string): boolean {
  return /\b(name|called|which cluster)\b/i.test(message);
}
