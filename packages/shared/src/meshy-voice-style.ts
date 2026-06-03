/** Natural spoken phrasing for Meshy voice chat (TTS). */

import { formatHostnameForSpeech } from "./meshy-hostname-speech.js";

export const MESHY_VOICE_SYSTEM_STYLE = `You are Meshy, a friendly senior SRE on a live voice call with the user — not writing a ticket or report.
Address the user politely as "Sir" when it feels natural.
Sound warm, human, and conversational: use contractions (you've, I'll, that's), brief acknowledgments like "Sure", and complete spoken sentences.
Lead with a direct answer to what they asked, then add one useful detail or context when it helps.
Refer back naturally on follow-ups ("Sure — for those namespaces…", "Right, so on your cluster…").
Vary your wording — avoid robotic telegraphic patterns like "73 nodes, 73 ready" or reading symbols aloud.
Use ONLY facts from LIVE CLUSTER DATA. Never invent resource names, counts, or statuses.
When listing names aloud, speak at most four or five examples in a natural sentence, then mention if there are more (full list stays in chat).
Optional: end with a short spoken offer when it fits ("Should I spell the list for you, Sir?").
Plain English only: no markdown, bullets, asterisks, backticks, emojis, kubectl commands, or symbols.
About two to five sentences, under 120 words.`;

export function voiceCheckingAck(): string {
  return "Okay Sir, give me a moment, I'm checking.";
}

export function voiceSureAck(): string {
  return "Sure.";
}

export function naturalJoin(items: string[], max = 4): string {
  const slice = items.slice(0, max);
  if (slice.length === 0) return "";
  if (slice.length === 1) return slice[0]!;
  if (slice.length === 2) return `${slice[0]} and ${slice[1]}`;
  return `${slice.slice(0, -1).join(", ")}, and ${slice[slice.length - 1]}`;
}

export function voiceCountReply(
  resourceLabel: string,
  count: number,
  detail?: string,
): string {
  const word = count === 1 ? singular(resourceLabel) : resourceLabel;
  if (detail) {
    return `There are ${count} ${word} in your cluster, Sir, and ${detail}.`;
  }
  return `There are ${count} ${word} in your cluster, Sir.`;
}

export function voiceEmptyReply(resourceLabel: string): string {
  return `I don't see any ${resourceLabel} in the cluster right now, Sir.`;
}

export function voiceListReply(
  resourceLabel: string,
  items: string[],
  options?: { limit?: number; sampleLimit?: number },
): string {
  const limit = options?.limit ?? items.length;
  const sampleLimit = options?.sampleLimit ?? 4;
  const count = items.length;

  if (count === 0) return voiceEmptyReply(resourceLabel);

  const shown = items.slice(0, Math.min(limit, sampleLimit));
  const examples = naturalJoin(shown, sampleLimit);

  if (count <= sampleLimit) {
    return `You have ${count} ${count === 1 ? singular(resourceLabel) : resourceLabel}, Sir. They include ${examples}.`;
  }

  const remaining = count - shown.length;
  return `There are ${count} ${resourceLabel} in total, Sir. A few examples are ${examples}, and ${remaining} more beyond that. I've put the full list in chat for you.`;
}

/** Intro + spell offer as separate voice utterances. */
export function voiceListIntroLine(resourceLabel: string): string {
  return `These are the ${resourceLabel} list, Sir.`;
}

/** Single spoken line after a list is fetched — spell-names offer. */
export function voiceListOfferLine(resourceLabel: string): string {
  return `${voiceListIntroLine(resourceLabel)} ${voiceSpellOffer()}`;
}

/** Answer lines after pre-fetch list ack (spell-names offer). */
export function voiceListTurnScript(
  resourceLabel: string,
  _items: string[],
): string[] {
  return [voiceListIntroLine(resourceLabel), voiceSpellOffer()];
}

export function voiceSpellOffer(): string {
  return "Should I spell the list for you, Sir?";
}

export function hasVoiceSpellOffer(text: string): boolean {
  return /should i spell the list|spell the list for you|spell the names|do you want me to spell/i.test(
    text,
  );
}

/** Split combined list+offer into two TTS lines; append offer if intro only. */
export function splitListOfferVoiceScript(voiceScript: string[]): string[] {
  const out: string[] = [];

  for (const line of voiceScript) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const combined = trimmed.match(
      /^(these are the .+? list,?\s*sir[.?!]?)\s+(should i spell the list for you,?\s*sir[.?!]?)$/i,
    );
    if (combined) {
      const intro = combined[1]!.trim();
      out.push(intro.endsWith(".") || intro.endsWith("?") ? intro : `${intro}.`);
      out.push(combined[2]!.trim());
      continue;
    }

    out.push(trimmed);
  }

  const hasIntro = out.some((l) => /these are the .+ list/i.test(l));
  const hasOffer = out.some((l) => hasVoiceSpellOffer(l));
  if (hasIntro && !hasOffer) {
    out.push(voiceSpellOffer());
  }

  return out;
}

export function formatSpellNamesChatMarkdown(
  names: string[],
  resourceLabel = "names",
): string {
  const lines = names.map((name, index) => {
    const host = name.split("/").pop() ?? name;
    return `${index + 1}. \`${host}\``;
  });

  return `**${resourceLabel} spelled for voice** (${names.length}):\n\n${lines.join("\n\n")}`;
}

/** One TTS line per node hostname (EC2-style pronunciation). */
export function voiceSpellNamesScript(
  names: string[],
  options?: { limit?: number },
): string[] {
  const limit = options?.limit ?? 10;
  const slice = names.slice(0, limit);
  const lines: string[] = ["Sure Sir, here are the names spelled out."];

  for (let index = 0; index < slice.length; index++) {
    const host = slice[index]!.split("/").pop() ?? slice[index]!;
    lines.push(`Node ${index + 1}: ${formatHostnameForSpeech(host)}`);
  }

  if (names.length > limit) {
    lines.push(
      `That's ${limit} of ${names.length}, Sir. The full list is in chat if you need more.`,
    );
  }

  return lines;
}

/** @deprecated Use voiceSpellNamesScript — kept for single-line fallbacks. */
export function voiceSpellNamesReply(names: string[]): string {
  return voiceSpellNamesScript(names).join(" ");
}

export function voiceClusterNameReply(name: string): string {
  return `You're connected to the ${name} cluster, Sir.`;
}

export function voiceVersionReply(version: string): string {
  return `This cluster is running Kubernetes version ${version}, Sir.`;
}

export function voiceNodeCountReply(total: number, ready: number): string {
  if (total === 0) return voiceEmptyReply("nodes");
  if (ready === total) {
    return `There are ${total} nodes in your cluster, Sir, and they're all showing ready.`;
  }
  const notReady = total - ready;
  return `There are ${total} nodes in your cluster, Sir. ${ready} are ready, and ${notReady} ${notReady === 1 ? "isn't" : "aren't"} ready yet.`;
}

export function voiceHealthSummary(
  clusterName: string,
  pods: number,
  unhealthy: number,
  readyNodes: number,
  totalNodes: number,
): string {
  const nodePart =
    totalNodes === 0
      ? "I couldn't read node status."
      : readyNodes === totalNodes
        ? `all ${totalNodes} nodes look ready`
        : `${readyNodes} of ${totalNodes} nodes are ready`;

  if (unhealthy === 0) {
    return `Overall, ${clusterName} looks healthy, Sir — about ${pods} pods and ${nodePart}.`;
  }
  return `${clusterName} has around ${pods} pods, Sir, with ${unhealthy} looking unhealthy, and ${nodePart}.`;
}

export function voiceOffTopicMessage(): string {
  return "I'm best with Kubernetes and DevOps questions, Sir — try asking about pods, nodes, deployments, or cluster health.";
}

export function voiceClarifyList(resource: string): string {
  return `Just to make sure, Sir — did you want me to list the ${resource}? You can say yes or no.`;
}

export function voiceCancelledReply(): string {
  return "No problem, Sir. What else would you like to know about the cluster?";
}

function singular(label: string): string {
  if (label.endsWith("ies")) return `${label.slice(0, -3)}y`;
  if (label.endsWith("ses")) return label.slice(0, -2);
  if (label.endsWith("s")) return label.slice(0, -1);
  return label;
}
