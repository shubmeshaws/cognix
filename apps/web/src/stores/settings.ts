import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_LLM_CHAIN,
  DEFAULT_PUTER_MODEL,
  isLegacyDefaultLlmChain,
  normalizeLlmChain,
  type LlmProviderChain,
  type LlmProviderId,
} from "@kubehealer/shared";
import { create } from "zustand";

export type { LlmProviderChain, LlmProviderId };

/** @deprecated Migrated to llmChain */
export type LlmPreference = "ollama" | "openai" | "ollama_then_openai";

export type HealingMode =
  | "autonomous_with_approval"
  | "approval_required"
  | "observe_only";

export interface AgentSettings {
  llmChain: LlmProviderChain;
  healingMode: HealingMode;
  ollamaUrl: string;
  ollamaModel: string;
  openaiApiKey: string;
  openaiModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
  puterAuthToken: string;
  puterModel: string;
  puterAppOrigin: string;
}

const STORAGE_KEY = "kubehealer-agent-settings";

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  llmChain: DEFAULT_LLM_CHAIN,
  healingMode: "autonomous_with_approval",
  ollamaUrl: "http://127.0.0.1:11434",
  ollamaModel: "llama3.2:1b",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  anthropicApiKey: "",
  anthropicModel: DEFAULT_ANTHROPIC_MODEL,
  puterAuthToken: "",
  puterModel: DEFAULT_PUTER_MODEL,
  puterAppOrigin: "",
};

function loadSettings(): AgentSettings {
  if (typeof window === "undefined") return DEFAULT_AGENT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AGENT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AgentSettings> & {
      llmPreference?: LlmPreference;
    };
    let llmChain = normalizeLlmChain(parsed.llmChain, parsed.llmPreference);
    if (isLegacyDefaultLlmChain(llmChain)) {
      llmChain = DEFAULT_LLM_CHAIN;
    }

    const puterModel =
      !parsed.puterModel || parsed.puterModel === "gpt-4o-mini"
        ? DEFAULT_PUTER_MODEL
        : parsed.puterModel;

    return {
      llmChain,
      healingMode: parsed.healingMode ?? DEFAULT_AGENT_SETTINGS.healingMode,
      ollamaUrl: parsed.ollamaUrl ?? DEFAULT_AGENT_SETTINGS.ollamaUrl,
      ollamaModel: parsed.ollamaModel ?? DEFAULT_AGENT_SETTINGS.ollamaModel,
      openaiApiKey: parsed.openaiApiKey ?? "",
      openaiModel: parsed.openaiModel ?? DEFAULT_AGENT_SETTINGS.openaiModel,
      anthropicApiKey: parsed.anthropicApiKey ?? "",
      anthropicModel:
        parsed.anthropicModel ?? DEFAULT_AGENT_SETTINGS.anthropicModel,
      puterAuthToken: parsed.puterAuthToken ?? "",
      puterModel,
      puterAppOrigin: parsed.puterAppOrigin ?? "",
    };
  } catch {
    return DEFAULT_AGENT_SETTINGS;
  }
}

function persistSettings(settings: AgentSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function snapshot(state: SettingsState): AgentSettings {
  return {
    llmChain: state.llmChain,
    healingMode: state.healingMode,
    ollamaUrl: state.ollamaUrl,
    ollamaModel: state.ollamaModel,
    openaiApiKey: state.openaiApiKey,
    openaiModel: state.openaiModel,
    anthropicApiKey: state.anthropicApiKey,
    anthropicModel: state.anthropicModel,
    puterAuthToken: state.puterAuthToken,
    puterModel: state.puterModel,
    puterAppOrigin: state.puterAppOrigin,
  };
}

interface SettingsState extends AgentSettings {
  hydrated: boolean;
  openaiKeyConfiguredOnAgent: boolean;
  anthropicKeyConfiguredOnAgent: boolean;
  puterTokenConfiguredOnAgent: boolean;
  hydrate: () => void;
  mergeFromAgent: (
    patch: Partial<AgentSettings> & {
      openaiApiKeySet?: boolean;
      anthropicApiKeySet?: boolean;
      puterAuthTokenSet?: boolean;
      puterAppOrigin?: string;
    },
  ) => void;
  setLlmChain: (chain: LlmProviderChain) => void;
  addProviderToChain: (provider: LlmProviderId) => boolean;
  removeProviderFromChain: (provider: LlmProviderId) => void;
  setHealingMode: (value: HealingMode) => void;
  setOllamaUrl: (value: string) => void;
  setOllamaModel: (value: string) => void;
  setOpenaiApiKey: (value: string) => void;
  setOpenaiModel: (value: string) => void;
  setAnthropicApiKey: (value: string) => void;
  setAnthropicModel: (value: string) => void;
  setPuterAuthToken: (value: string) => void;
  setPuterModel: (value: string) => void;
  setPuterAppOrigin: (value: string) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_AGENT_SETTINGS,
  hydrated: false,
  openaiKeyConfiguredOnAgent: false,
  anthropicKeyConfiguredOnAgent: false,
  puterTokenConfiguredOnAgent: false,

  hydrate: () => {
    const loaded = loadSettings();
    set({ ...loaded, hydrated: true });
  },

  mergeFromAgent: (patch) => {
    set((state) => {
      const stillDefaults =
        state.ollamaUrl === DEFAULT_AGENT_SETTINGS.ollamaUrl &&
        state.ollamaModel === DEFAULT_AGENT_SETTINGS.ollamaModel &&
        state.openaiModel === DEFAULT_AGENT_SETTINGS.openaiModel &&
        state.anthropicModel === DEFAULT_AGENT_SETTINGS.anthropicModel &&
        state.puterModel === DEFAULT_AGENT_SETTINGS.puterModel;

      return {
        // llmChain is only updated via user actions (add/remove/apply), not agent fetch.
        ...(patch.llmChain
          ? { llmChain: normalizeLlmChain(patch.llmChain) }
          : {}),
        ...(stillDefaults && patch.ollamaUrl
          ? { ollamaUrl: patch.ollamaUrl }
          : {}),
        ...(stillDefaults && patch.ollamaModel
          ? { ollamaModel: patch.ollamaModel }
          : {}),
        ...(stillDefaults && patch.openaiModel
          ? { openaiModel: patch.openaiModel }
          : {}),
        ...(stillDefaults && patch.anthropicModel
          ? { anthropicModel: patch.anthropicModel }
          : {}),
        ...(stillDefaults && patch.puterModel
          ? { puterModel: patch.puterModel }
          : {}),
        ...(patch.puterAppOrigin
          ? { puterAppOrigin: patch.puterAppOrigin }
          : {}),
        openaiKeyConfiguredOnAgent:
          patch.openaiApiKeySet ?? state.openaiKeyConfiguredOnAgent,
        anthropicKeyConfiguredOnAgent:
          patch.anthropicApiKeySet ?? state.anthropicKeyConfiguredOnAgent,
        puterTokenConfiguredOnAgent:
          patch.puterAuthTokenSet ?? state.puterTokenConfiguredOnAgent,
      };
    });
  },

  setLlmChain: (llmChain) => {
    set((state) => {
      const next = { ...state, llmChain: normalizeLlmChain(llmChain) };
      persistSettings(snapshot(next));
      return next;
    });
  },

  addProviderToChain: (provider) => {
    let added = false;
    set((state) => {
      if (state.llmChain.includes(provider)) {
        return state;
      }
      const nextChain = [...state.llmChain] as LlmProviderChain;
      const idx = nextChain.findIndex((p) => p === null);
      if (idx === -1) return state;
      nextChain[idx] = provider;
      added = true;
      const next = { ...state, llmChain: nextChain };
      persistSettings(snapshot(next));
      return next;
    });
    return added;
  },

  removeProviderFromChain: (provider) => {
    set((state) => {
      const nextChain = state.llmChain.map((p) =>
        p === provider ? null : p,
      ) as LlmProviderChain;
      const next = { ...state, llmChain: nextChain };
      persistSettings(snapshot(next));
      return next;
    });
  },

  setHealingMode: (healingMode) => {
    set((state) => {
      const next = { ...state, healingMode };
      persistSettings(snapshot(next));
      return next;
    });
  },

  setOllamaUrl: (ollamaUrl) => {
    set((state) => {
      const next = { ...state, ollamaUrl };
      persistSettings(snapshot(next));
      return next;
    });
  },

  setOllamaModel: (ollamaModel) => {
    set((state) => {
      const next = { ...state, ollamaModel };
      persistSettings(snapshot(next));
      return next;
    });
  },

  setOpenaiApiKey: (openaiApiKey) => {
    set((state) => {
      const next = { ...state, openaiApiKey };
      persistSettings(snapshot(next));
      return next;
    });
  },

  setOpenaiModel: (openaiModel) => {
    set((state) => {
      const next = { ...state, openaiModel };
      persistSettings(snapshot(next));
      return next;
    });
  },

  setAnthropicApiKey: (anthropicApiKey) => {
    set((state) => {
      const next = { ...state, anthropicApiKey };
      persistSettings(snapshot(next));
      return next;
    });
  },

  setAnthropicModel: (anthropicModel) => {
    set((state) => {
      const next = { ...state, anthropicModel };
      persistSettings(snapshot(next));
      return next;
    });
  },

  setPuterAuthToken: (puterAuthToken) => {
    set((state) => {
      const next = { ...state, puterAuthToken };
      persistSettings(snapshot(next));
      return next;
    });
  },

  setPuterModel: (puterModel) => {
    set((state) => {
      const next = { ...state, puterModel };
      persistSettings(snapshot(next));
      return next;
    });
  },

  setPuterAppOrigin: (puterAppOrigin) => {
    set((state) => {
      const next = { ...state, puterAppOrigin };
      persistSettings(snapshot(next));
      return next;
    });
  },

  reset: () => {
    persistSettings(DEFAULT_AGENT_SETTINGS);
    set({
      ...DEFAULT_AGENT_SETTINGS,
      openaiKeyConfiguredOnAgent: false,
      anthropicKeyConfiguredOnAgent: false,
      puterTokenConfiguredOnAgent: false,
    });
  },
}));
