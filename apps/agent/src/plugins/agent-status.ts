import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { normalizeLlmChain } from "@kubehealer/shared";

import type { ServerDeps } from "../context/deps.js";
import {
  getEffectiveAnthropicKey,
  getEffectiveOllamaUrl,
  getEffectiveOpenAiKey,
  getEffectivePuterAuthToken,
} from "../config/llm-runtime.js";
import {
  applyLlmConfigPatch,
  getLlmConfigResponse,
  testLlmProvider,
} from "../services/llm-config.js";
import {
  applyTeamsConfigPatch,
  getEffectiveTeamsWebhookUrl,
  getTeamsConfigResponse,
  testTeamsConnection,
} from "../services/teams-config.js";

const llmProviderIdSchema = z.enum(["ollama", "openai", "anthropic", "puter"]);

const llmChainSchema = z
  .tuple([
    llmProviderIdSchema.nullable(),
    llmProviderIdSchema.nullable(),
    llmProviderIdSchema.nullable(),
  ])
  .optional();

export const agentStatusPlugin: FastifyPluginAsync<{ deps: ServerDeps }> = async (
  app,
  opts,
) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/status", async () => {
    const ollamaUrl = getEffectiveOllamaUrl(opts.deps.env);
    let ollamaOk = false;
    try {
      const res = await fetch(new URL("/api/tags", ollamaUrl).toString(), {
        signal: AbortSignal.timeout(3_000),
      });
      ollamaOk = res.ok;
    } catch {
      ollamaOk = false;
    }

    const openaiKey = getEffectiveOpenAiKey(opts.deps.env);
    const anthropicKey = getEffectiveAnthropicKey(opts.deps.env);
    const puterToken = getEffectivePuterAuthToken(opts.deps.env);

    return {
      uptimeSec: Math.floor((Date.now() - opts.deps.startedAt) / 1000),
      healingPaused: opts.deps.watcher.isHealingPaused(),
      manualHealEnabled: opts.deps.watcher.isManualHealEnabled(),
      watcher: {
        activeClusters: opts.deps.watcher.activeClusterCount,
        wsClients: opts.deps.clusterHub.watcherCount(),
        connectedClusters: opts.deps.clusterHub.connectedClusters(),
      },
      llm: {
        ollama: {
          url: ollamaUrl,
          ok: ollamaOk,
        },
        openaiConfigured: Boolean(openaiKey),
        anthropicConfigured: Boolean(anthropicKey),
        puterConfigured: Boolean(puterToken),
      },
      teams: {
        configured: Boolean(getEffectiveTeamsWebhookUrl(opts.deps.env)),
      },
    };
  });

  app.get("/llm-config", async () => {
    return getLlmConfigResponse(opts.deps.env);
  });

  app.patch("/healing", async (request, reply) => {
    const body = z
      .object({
        paused: z.boolean(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    opts.deps.watcher.setHealingPaused(body.data.paused);

    return {
      healingPaused: opts.deps.watcher.isHealingPaused(),
    };
  });

  app.patch("/manual-heal", async (request, reply) => {
    const body = z
      .object({
        enabled: z.boolean(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    opts.deps.watcher.setManualHealEnabled(body.data.enabled);

    return {
      manualHealEnabled: opts.deps.watcher.isManualHealEnabled(),
    };
  });

  app.patch("/llm-config", async (request, reply) => {
    const body = z
      .object({
        llmChain: llmChainSchema,
        ollamaUrl: z.string().url().optional(),
        ollamaModel: z.string().min(1).max(128).optional(),
        openaiApiKey: z.string().min(1).optional(),
        openaiModel: z.string().min(1).max(128).optional(),
        anthropicApiKey: z.string().min(1).optional(),
        anthropicModel: z.string().min(1).max(128).optional(),
        puterAuthToken: z.string().min(1).optional(),
        puterModel: z.string().min(1).max(128).optional(),
        puterAppOrigin: z.string().url().optional(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    const patch = {
      ...body.data,
      llmChain: body.data.llmChain
        ? normalizeLlmChain(body.data.llmChain)
        : undefined,
    };

    return applyLlmConfigPatch(opts.deps.env, patch);
  });

  app.get("/teams-config", async () => {
    return getTeamsConfigResponse(opts.deps.env);
  });

  app.patch("/teams-config", async (request, reply) => {
    const body = z
      .object({
        teamsWebhookUrl: z
          .string()
          .refine((s) => s === "" || /^https:\/\/.+/i.test(s), {
            message: "Webhook must be an HTTPS URL",
          })
          .optional(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    return applyTeamsConfigPatch(opts.deps.env, {
      teamsWebhookUrl: body.data.teamsWebhookUrl,
    });
  });

  app.post("/teams-config/test", async (request, reply) => {
    const body = z
      .object({
        teamsWebhookUrl: z.string().url().optional(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    return testTeamsConnection(opts.deps.env, body.data.teamsWebhookUrl);
  });

  app.post("/llm-config/test", async (request, reply) => {
    const body = z
      .object({
        provider: llmProviderIdSchema,
        ollamaUrl: z.string().url().optional(),
        ollamaModel: z.string().min(1).optional(),
        openaiApiKey: z.string().min(1).optional(),
        openaiModel: z.string().min(1).optional(),
        anthropicApiKey: z.string().min(1).optional(),
        anthropicModel: z.string().min(1).optional(),
        puterAuthToken: z.string().min(1).optional(),
        puterModel: z.string().min(1).optional(),
        puterAppOrigin: z.string().url().optional(),
      })
      .safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    return testLlmProvider(opts.deps.env, body.data.provider, body.data);
  });
};
