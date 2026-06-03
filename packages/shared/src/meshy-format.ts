/** Format multi-value Meshy replies for readable line-by-line display. */

function looksLikeResourceName(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(value);
}

function splitCommaList(listPart: string): string[] {
  return listPart
    .replace(/\.\s*$/, "")
    .split(/,\s*/)
    .map((item) => item.trim().replace(/^and\s+/i, ""))
    .filter(Boolean);
}

/** Turn comma-separated LLM lists into markdown bullets (one item per line). */
export function formatMeshyCommaListReply(text: string): string {
  const trimmed = text.trim();
  if (!trimmed || /^\s*[-*•]\s/m.test(trimmed) || trimmed.includes("\n- ")) {
    return trimmed;
  }

  const colonIdx = trimmed.indexOf(":");
  if (colonIdx === -1) return trimmed;

  const intro = trimmed.slice(0, colonIdx + 1);
  const listPart = trimmed.slice(colonIdx + 1).trim();
  const items = splitCommaList(listPart);

  if (items.length < 3 || !items.every(looksLikeResourceName)) {
    return trimmed;
  }

  return `${intro}\n\n${items.map((item) => `- \`${item}\``).join("\n")}`;
}

export interface MeshyItemListOptions {
  voiceMode?: boolean;
  /** e.g. "Namespaces in your cluster" */
  title: string;
  limit?: number;
  kubectl?: string;
}

/** Format a list of resource names for chat (bullets) or voice TTS (compact). */
export function formatMeshyItemList(
  items: string[],
  options: MeshyItemListOptions,
): string {
  const limit = options.limit ?? items.length;
  const shown = items.slice(0, limit);
  const kubectl = options.kubectl
    ? `\n\n\`\`\`bash\n${options.kubectl}\n\`\`\``
    : "";

  if (options.voiceMode) {
    const spoken = shown.join(". ");
    const suffix =
      items.length > limit ? `. And ${items.length - limit} more.` : ".";
    return `${options.title}: ${spoken}${suffix}`;
  }

  const bullets = shown.map((item) => `- \`${item}\``).join("\n");
  const more =
    items.length > limit
      ? `\n- *…and ${items.length - limit} more*`
      : "";

  return `**${options.title}** (${items.length}):\n\n${bullets}${more}${kubectl}`;
}
