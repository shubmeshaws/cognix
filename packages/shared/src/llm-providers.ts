/** LLM backends available in kubehealer. */
export type LlmProviderId = "ollama" | "openai" | "anthropic" | "puter";

/** Three-slot fallback chain: primary → 1st fallback → 2nd fallback. */
export type LlmProviderChain = [
  LlmProviderId | null,
  LlmProviderId | null,
  LlmProviderId | null,
];

export const LLM_CHAIN_SLOT_LABELS = [
  "Primary",
  "1st fallback",
  "2nd fallback",
] as const;

export type LlmChainSlotLabel = (typeof LLM_CHAIN_SLOT_LABELS)[number];

/** Empty chain — user adds providers from the list. */
export const DEFAULT_LLM_CHAIN: LlmProviderChain = [null, null, null];

/** Puter OpenAI-compatible default (see docs.puter.com/AI/chat/). */
export const DEFAULT_PUTER_MODEL = "gpt-5-nano";

/** Default Claude model for diagnosis and chat. */
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

const LEGACY_DEFAULT_CHAIN: LlmProviderChain = ["ollama", "openai", null];

export function isLegacyDefaultLlmChain(chain: LlmProviderChain): boolean {
  return (
    chain[0] === LEGACY_DEFAULT_CHAIN[0] &&
    chain[1] === LEGACY_DEFAULT_CHAIN[1] &&
    chain[2] === LEGACY_DEFAULT_CHAIN[2]
  );
}

export const LLM_PROVIDER_CATALOG: {
  id: LlmProviderId;
  label: string;
  description: string;
}[] = [
  {
    id: "ollama",
    label: "Ollama",
    description: "Local Ollama install — URL + model name.",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "OpenAI API key + model (gpt-4o-mini, etc.).",
  },
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    description: "Anthropic API key + Claude model (claude-sonnet-4, etc.).",
  },
  {
    id: "puter",
    label: "Puter.js",
    description:
      "Sign in with Puter.js (Google, etc.). Default model gpt-5-nano; also openai/gpt-5.2-chat, gpt-5.4-nano.",
  },
];

export function normalizeLlmChain(
  input: unknown,
  legacyPreference?: string,
): LlmProviderChain {
  if (Array.isArray(input) && input.length === 3) {
    const ids = ["ollama", "openai", "anthropic", "puter"] as const;
    const chain = input.map((v) =>
      typeof v === "string" && ids.includes(v as LlmProviderId)
        ? (v as LlmProviderId)
        : null,
    ) as LlmProviderChain;
    return chain;
  }

  switch (legacyPreference) {
    case "ollama":
      return ["ollama", null, null];
    case "openai":
      return ["openai", null, null];
    case "ollama_then_openai":
      return ["ollama", "openai", null];
    default:
      return DEFAULT_LLM_CHAIN;
  }
}
