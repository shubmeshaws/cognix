"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { fetchLlmConfig, updateLlmConfig } from "@/lib/api";
import { chainsMatch } from "@/lib/llm-display";
import { normalizePuterAppOrigin } from "@/lib/puter-auth";
import { useAgentToken } from "@/hooks/useAgentToken";
import { useSettingsStore } from "@/stores/settings";

/** Push browser Settings to the agent when they diverge (e.g. after agent restart). */
export function LlmConfigBootstrap() {
  const token = useAgentToken();
  const queryClient = useQueryClient();
  const syncedRef = useRef(false);
  const mergeFromAgent = useSettingsStore((s) => s.mergeFromAgent);

  useEffect(() => {
    if (!token || syncedRef.current) return;
    syncedRef.current = true;

    void (async () => {
      try {
        const agentConfig = await fetchLlmConfig(token);
        mergeFromAgent({
          llmChain: agentConfig.llmChain,
          ollamaUrl: agentConfig.ollamaUrl,
          ollamaModel: agentConfig.ollamaModel,
          openaiModel: agentConfig.openaiModel,
          anthropicModel: agentConfig.anthropicModel,
          puterModel: agentConfig.puterModel,
          puterAppOrigin: agentConfig.puterAppOrigin,
          openaiApiKeySet: agentConfig.openaiApiKeySet,
          anthropicApiKeySet: agentConfig.anthropicApiKeySet,
          puterAuthTokenSet: agentConfig.puterAuthTokenSet,
        });

        const settings = useSettingsStore.getState();
        const localChain = settings.llmChain.filter(Boolean);
        if (localChain.length === 0) return;

        const needsApply =
          !chainsMatch(settings.llmChain, agentConfig.llmChain) ||
          agentConfig.activeChain[0] !== localChain[0];

        if (!needsApply) return;

        const body: Parameters<typeof updateLlmConfig>[1] = {
          llmChain: settings.llmChain,
        };

        if (settings.llmChain.includes("ollama")) {
          const url = settings.ollamaUrl.trim();
          const model = settings.ollamaModel.trim();
          if (url) body.ollamaUrl = url;
          if (model) body.ollamaModel = model;
        }
        if (settings.llmChain.includes("openai")) {
          const model = settings.openaiModel.trim();
          if (model) body.openaiModel = model;
          if (settings.openaiApiKey.trim()) {
            body.openaiApiKey = settings.openaiApiKey.trim();
          }
        }
        if (settings.llmChain.includes("anthropic")) {
          const model = settings.anthropicModel.trim();
          if (model) body.anthropicModel = model;
          if (settings.anthropicApiKey.trim()) {
            body.anthropicApiKey = settings.anthropicApiKey.trim();
          }
        }
        if (settings.llmChain.includes("puter")) {
          const model = settings.puterModel.trim();
          if (model) body.puterModel = model;
          if (settings.puterAuthToken.trim()) {
            body.puterAuthToken = settings.puterAuthToken.trim();
          }
          const origin =
            typeof window !== "undefined"
              ? normalizePuterAppOrigin(
                  settings.puterAppOrigin.trim() || window.location.origin,
                )
              : settings.puterAppOrigin.trim() || undefined;
          if (origin) body.puterAppOrigin = origin;
        }

        const applied = await updateLlmConfig(token, body);
        mergeFromAgent({
          llmChain: applied.llmChain,
          openaiApiKeySet: applied.openaiApiKeySet,
          anthropicApiKeySet: applied.anthropicApiKeySet,
          puterAuthTokenSet: applied.puterAuthTokenSet,
          puterAppOrigin: applied.puterAppOrigin,
        });
        void queryClient.invalidateQueries({ queryKey: ["agent-status"] });
        void queryClient.invalidateQueries({ queryKey: ["llm-config"] });
      } catch {
        // Agent offline or unauthenticated — Settings UI still works locally
      }
    })();
  }, [token, mergeFromAgent, queryClient]);

  return null;
}
