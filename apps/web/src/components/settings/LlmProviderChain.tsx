"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_ANTHROPIC_MODEL,
  LLM_CHAIN_SLOT_LABELS,
  LLM_PROVIDER_CATALOG,
  type LlmChainSlotLabel,
  type LlmProviderId,
} from "@kubehealer/shared";
import { Bot, Brain, Cloud, Cpu, Plus, Trash2 } from "lucide-react";

import { InfoTooltip } from "@/components/InfoTooltip";
import { PuterAuthBlock } from "@/components/settings/PuterAuthBlock";
import { Button } from "@/components/ui/button";
import {
  fetchLlmConfig,
  parseApiErrorMessage,
  testLlmConnection,
  updateLlmConfig,
} from "@/lib/api";
import { normalizePuterAppOrigin } from "@/lib/puter-auth";
import { useAgentToken } from "@/hooks/useAgentToken";
import { useSettingsStore } from "@/stores/settings";
import { cn } from "@/lib/utils";

const PROVIDER_ICONS: Record<LlmProviderId, typeof Cpu> = {
  ollama: Cpu,
  openai: Cloud,
  anthropic: Brain,
  puter: Bot,
};

function providerSummary(
  id: LlmProviderId,
  settings: ReturnType<typeof useSettingsStore.getState>,
): string {
  switch (id) {
    case "ollama":
      return `${settings.ollamaModel} · ${settings.ollamaUrl}`;
    case "openai":
      return settings.openaiModel;
    case "anthropic":
      return settings.anthropicModel;
    case "puter":
      return settings.puterModel;
    default:
      return "";
  }
}

function ProviderConfigFields({
  provider,
  onTest,
  testing,
  testLabel = "Test via agent",
}: {
  provider: LlmProviderId;
  onTest: () => void;
  testing: boolean;
  testLabel?: string;
}) {
  const ollamaUrl = useSettingsStore((s) => s.ollamaUrl);
  const ollamaModel = useSettingsStore((s) => s.ollamaModel);
  const openaiApiKey = useSettingsStore((s) => s.openaiApiKey);
  const openaiModel = useSettingsStore((s) => s.openaiModel);
  const anthropicApiKey = useSettingsStore((s) => s.anthropicApiKey);
  const anthropicModel = useSettingsStore((s) => s.anthropicModel);
  const openaiKeyConfiguredOnAgent = useSettingsStore(
    (s) => s.openaiKeyConfiguredOnAgent,
  );
  const anthropicKeyConfiguredOnAgent = useSettingsStore(
    (s) => s.anthropicKeyConfiguredOnAgent,
  );
  const setOllamaUrl = useSettingsStore((s) => s.setOllamaUrl);
  const setOllamaModel = useSettingsStore((s) => s.setOllamaModel);
  const setOpenaiApiKey = useSettingsStore((s) => s.setOpenaiApiKey);
  const setOpenaiModel = useSettingsStore((s) => s.setOpenaiModel);
  const setAnthropicApiKey = useSettingsStore((s) => s.setAnthropicApiKey);
  const setAnthropicModel = useSettingsStore((s) => s.setAnthropicModel);

  const fieldClass =
    "w-full rounded-md border bg-background px-3 py-2 text-sm";

  if (provider === "ollama") {
    return (
      <div className="mt-3 space-y-3 border-t pt-3">
        <label className="block space-y-1 text-xs">
          <span className="font-medium">Ollama URL</span>
          <input
            className={fieldClass}
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            placeholder="http://127.0.0.1:11434"
          />
        </label>
        <label className="block space-y-1 text-xs">
          <span className="font-medium">Model name</span>
          <input
            className={fieldClass}
            value={ollamaModel}
            onChange={(e) => setOllamaModel(e.target.value)}
            placeholder="llama3.1:8b"
          />
        </label>
        <Button type="button" size="sm" variant="outline" disabled={testing} onClick={onTest}>
          {testLabel}
        </Button>
      </div>
    );
  }

  if (provider === "openai") {
    return (
      <div className="mt-3 space-y-3 border-t pt-3">
        <label className="block space-y-1 text-xs">
          <span className="font-medium">API key</span>
          <input
            type="password"
            className={fieldClass}
            value={openaiApiKey}
            onChange={(e) => setOpenaiApiKey(e.target.value)}
            placeholder={
              openaiKeyConfiguredOnAgent
                ? "Leave blank to use key already on agent"
                : "sk-..."
            }
          />
        </label>
        {!openaiApiKey.trim() && !openaiKeyConfiguredOnAgent && (
          <p className="text-xs text-amber-600">
            Enter your OpenAI API key above, or Apply to agent after saving one.
          </p>
        )}
        <label className="block space-y-1 text-xs">
          <span className="font-medium">Model</span>
          <input
            className={fieldClass}
            value={openaiModel}
            onChange={(e) => setOpenaiModel(e.target.value)}
            placeholder="gpt-4o-mini"
          />
        </label>
        <Button type="button" size="sm" variant="outline" disabled={testing} onClick={onTest}>
          {testLabel}
        </Button>
      </div>
    );
  }

  if (provider === "anthropic") {
    return (
      <div className="mt-3 space-y-3 border-t pt-3">
        <label className="block space-y-1 text-xs">
          <span className="font-medium">Claude API key</span>
          <input
            type="password"
            className={fieldClass}
            value={anthropicApiKey}
            onChange={(e) => setAnthropicApiKey(e.target.value)}
            placeholder={
              anthropicKeyConfiguredOnAgent
                ? "Leave blank to keep existing key on agent"
                : "sk-ant-..."
            }
          />
        </label>
        <label className="block space-y-1 text-xs">
          <span className="font-medium">Model</span>
          <input
            className={fieldClass}
            value={anthropicModel}
            onChange={(e) => setAnthropicModel(e.target.value)}
            placeholder={DEFAULT_ANTHROPIC_MODEL}
          />
        </label>
        <Button type="button" size="sm" variant="outline" disabled={testing} onClick={onTest}>
          {testLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <PuterAuthBlock onTest={onTest} testing={testing} testLabel={testLabel} />
    </div>
  );
}

export function LlmProviderChain({ embedded = false }: { embedded?: boolean }) {
  const token = useAgentToken();
  const queryClient = useQueryClient();
  const llmChain = useSettingsStore((s) => s.llmChain);
  const addProviderToChain = useSettingsStore((s) => s.addProviderToChain);
  const removeProviderFromChain = useSettingsStore((s) => s.removeProviderFromChain);
  const mergeFromAgent = useSettingsStore((s) => s.mergeFromAgent);
  const settings = useSettingsStore();

  const [expanded, setExpanded] = useState<LlmProviderId | null>(null);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [applyMsg, setApplyMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const agentChainMergedRef = useRef(false);

  const configQuery = useQuery({
    queryKey: ["llm-config"],
    queryFn: () => fetchLlmConfig(token!),
    enabled: Boolean(token),
    retry: 1,
  });

  useEffect(() => {
    if (!configQuery.data || agentChainMergedRef.current) return;
    agentChainMergedRef.current = true;
    mergeFromAgent({
      llmChain: configQuery.data.llmChain,
      ollamaUrl: configQuery.data.ollamaUrl,
      ollamaModel: configQuery.data.ollamaModel,
      openaiModel: configQuery.data.openaiModel,
      anthropicModel: configQuery.data.anthropicModel,
      puterModel: configQuery.data.puterModel,
      puterAppOrigin: configQuery.data.puterAppOrigin,
      openaiApiKeySet: configQuery.data.openaiApiKeySet,
      anthropicApiKeySet: configQuery.data.anthropicApiKeySet,
      puterAuthTokenSet: configQuery.data.puterAuthTokenSet,
    });
  }, [configQuery.data, mergeFromAgent]);

  const chainEntries = llmChain
    .map((provider, index) => ({ provider, slot: LLM_CHAIN_SLOT_LABELS[index] }))
    .filter(
      (e): e is { provider: LlmProviderId; slot: LlmChainSlotLabel } =>
        e.provider !== null,
    );

  const slotsFull = llmChain.every((p) => p !== null);
  const usedProviders = new Set(llmChain.filter(Boolean));

  const buildApplyBody = (): Parameters<typeof updateLlmConfig>[1] => {
    const settings = useSettingsStore.getState();
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
    }

    const origin =
      typeof window !== "undefined"
        ? normalizePuterAppOrigin(
            settings.puterAppOrigin.trim() || window.location.origin,
          )
        : settings.puterAppOrigin.trim() || undefined;
    if (origin && settings.llmChain.includes("puter")) {
      body.puterAppOrigin = origin;
      useSettingsStore.getState().setPuterAppOrigin(origin);
    }
    return body;
  };

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not authenticated");
      return updateLlmConfig(token, buildApplyBody());
    },
    onSuccess: (data) => {
      setApplyMsg({ ok: true, text: "Updated agent configuration." });
      mergeFromAgent({
        llmChain: data.llmChain,
        openaiApiKeySet: data.openaiApiKeySet,
        anthropicApiKeySet: data.anthropicApiKeySet,
        puterAuthTokenSet: data.puterAuthTokenSet,
        puterAppOrigin: data.puterAppOrigin,
      });
      void queryClient.invalidateQueries({ queryKey: ["agent-status"] });
      void queryClient.invalidateQueries({ queryKey: ["llm-config"] });
    },
    onError: (err) =>
      setApplyMsg({ ok: false, text: parseApiErrorMessage(err) }),
  });

  const testMutation = useMutation({
    mutationFn: async (provider: LlmProviderId) => {
      if (!token) throw new Error("Not authenticated");
      const settings = useSettingsStore.getState();
      const origin =
        typeof window !== "undefined"
          ? normalizePuterAppOrigin(
              settings.puterAppOrigin.trim() || window.location.origin,
            )
          : settings.puterAppOrigin.trim() || undefined;

      return testLlmConnection(token, {
        provider,
        ollamaUrl: settings.ollamaUrl.trim() || undefined,
        ollamaModel: settings.ollamaModel.trim() || undefined,
        openaiApiKey: settings.openaiApiKey.trim() || undefined,
        openaiModel: settings.openaiModel.trim() || undefined,
        anthropicApiKey: settings.anthropicApiKey.trim() || undefined,
        anthropicModel: settings.anthropicModel.trim() || undefined,
        puterAuthToken: settings.puterAuthToken.trim() || undefined,
        puterModel: settings.puterModel.trim() || undefined,
        puterAppOrigin: origin,
      });
    },
    onSuccess: async (data) => {
      setTestMsg({ ok: data.ok, text: data.message });
      if (!data.ok || !token) return;
      try {
        const applied = await updateLlmConfig(token, buildApplyBody());
        setApplyMsg({ ok: true, text: "Test passed — applied to agent." });
        mergeFromAgent({
          llmChain: applied.llmChain,
          openaiApiKeySet: applied.openaiApiKeySet,
          anthropicApiKeySet: applied.anthropicApiKeySet,
          puterAuthTokenSet: applied.puterAuthTokenSet,
          puterAppOrigin: applied.puterAppOrigin,
        });
        void queryClient.invalidateQueries({ queryKey: ["agent-status"] });
        void queryClient.invalidateQueries({ queryKey: ["llm-config"] });
      } catch (err) {
        setApplyMsg({
          ok: false,
          text: `Test passed but apply failed: ${parseApiErrorMessage(err)}`,
        });
      }
    },
    onError: (err) =>
      setTestMsg({ ok: false, text: parseApiErrorMessage(err) }),
  });

  const handleAdd = (provider: LlmProviderId) => {
    setAddMsg(null);
    const added = addProviderToChain(provider);
    if (!added) {
      setAddMsg(
        slotsFull
          ? "Chain is full (primary + 2 fallbacks). Remove one to add another."
          : `${LLM_PROVIDER_CATALOG.find((p) => p.id === provider)?.label} is already in the chain.`,
      );
      return;
    }
    setExpanded(provider);
  };

  const handleRemove = (provider: LlmProviderId) => {
    removeProviderFromChain(provider);
    if (expanded === provider) setExpanded(null);
    if (!token) {
      setApplyMsg({
        ok: false,
        text: "Removed locally. Sign in and Apply to agent to sync.",
      });
      return;
    }
    setApplyMsg(null);
    applyMutation.mutate();
  };

  return (
    <div className={embedded ? "space-y-4" : "space-y-4"}>
      {!embedded && (
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">LLM provider chain</h3>
          <InfoTooltip content="Order matters: the agent tries Primary first, then 1st fallback, then 2nd fallback. Configure each provider below, test the key, then Apply to agent." />
        </div>
      )}

      {configQuery.isError && (
        <p className="text-sm text-red-600">
          Could not load agent config: {parseApiErrorMessage(configQuery.error)}
        </p>
      )}

      {chainEntries.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {chainEntries.map(({ provider, slot }) => {
            const meta = LLM_PROVIDER_CATALOG.find((p) => p.id === provider)!;
            const Icon = PROVIDER_ICONS[provider];
            const isOpen = expanded === provider;

            return (
              <li key={`${slot}-${provider}`} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() =>
                      setExpanded(isOpen ? null : provider)
                    }
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {slot}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {providerSummary(provider, settings)}
                    </p>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-red-600"
                    onClick={() => handleRemove(provider)}
                    aria-label={`Remove ${meta.label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {isOpen && (
                  <ProviderConfigFields
                    provider={provider}
                    testing={testMutation.isPending}
                    onTest={() => testMutation.mutate(provider)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No providers in the chain yet. Add Ollama, OpenAI, Claude, or Puter.js below.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Add provider</p>
        <div className="flex flex-wrap gap-2">
          {LLM_PROVIDER_CATALOG.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant="outline"
              size="sm"
              disabled={usedProviders.has(p.id) || slotsFull}
              onClick={() => handleAdd(p.id)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {p.label}
            </Button>
          ))}
        </div>
        {addMsg && <p className="text-xs text-amber-600">{addMsg}</p>}
      </div>

      {testMsg && (
        <p
          className={cn(
            "text-sm",
            testMsg.ok ? "text-emerald-600" : "text-red-600",
          )}
        >
          {testMsg.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={applyMutation.isPending || !token || chainEntries.length === 0}
          onClick={() => applyMutation.mutate()}
        >
          {applyMutation.isPending ? "Applying…" : "Apply to agent"}
        </Button>
        {applyMsg && (
          <span
            className={cn(
              "text-xs",
              applyMsg.ok ? "text-muted-foreground" : "text-red-600",
            )}
          >
            {applyMsg.text}
          </span>
        )}
      </div>
    </div>
  );
}
