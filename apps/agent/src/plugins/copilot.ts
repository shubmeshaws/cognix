import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  buildMeshyIntentHint,
  buildMeshyVoiceScript,
  ensureVoiceListSpellOffer,
  splitListOfferVoiceScript,
  formatMeshyCommaListReply,
  isExplicitPodListRequest,
  isAffirmativeReply,
  isKubernetesRelated,
  isNegativeReply,
  meshyOffTopicMessage,
  MESHY_VOICE_SYSTEM_STYLE,
  normalizeKubernetesInput,
  parsePendingClarification,
  resolveListMessage,
  resolveMeshyConversationTurn,
} from "@kubehealer/shared";

import type { ServerDeps } from "../context/deps.js";
import { healRecords, clusters } from "../db/schema.js";
import { getClusterConnection, verifyClusterOwnership } from "../services/cluster-connection.js";
import {
  fetchMeshyClusterContext,
  formatClusterHealthSummary,
  formatMeshyClusterContext,
  tryMeshyDirectAnswer,
} from "../services/meshy-cluster-context.js";
import { listPodSummaries } from "../services/pod-summaries.js";
import { PodReasoner } from "../llm/reasoner.js";
import { detectIssue, getPodRestartCount, formatEvents } from "../watcher/detectIssue.js";
import { buildOomMemorySnapshot } from "../healer/oom-snapshot.js";
import {
  getConfiguredChain,
  getEffectiveAnthropicKey,
  getEffectiveAnthropicModel,
  getEffectiveOllamaUrl,
  getEffectiveOllamaModel,
  getEffectiveOpenAiKey,
  getEffectiveOpenAiModel,
  getEffectivePuterAppOrigin,
  getEffectivePuterAuthToken,
  getEffectivePuterModel,
} from "../config/llm-runtime.js";
import { callAnthropic } from "../llm/providers/anthropic.js";
import { callOllama } from "../llm/providers/ollama.js";
import { callOpenAiChat } from "../llm/providers/openai.js";
import { callPuter } from "../llm/providers/puter.js";
import type { Env } from "../config/env.js";

const ACTION_INTENTS = new Set([
  "scan-cluster",
  "list-pods",
  "diagnose-pod",
  "heal-pod",
  "restart-pod",
  "scale-deployment",
]);

const POD_LIST_INTENTS = new Set(["scan-cluster", "list-pods"]);

async function completeChat(
  env: Env,
  system: string,
  prompt: string,
  log?: any,
): Promise<string> {
  const chain = getConfiguredChain(env);
  if (chain.length === 0) {
    throw new Error("No LLM providers configured. Set primary/fallback chain in Settings.");
  }

  const errors: unknown[] = [];

  for (const provider of chain) {
    try {
      log?.info({ provider }, "calling LLM provider for copilot chat");
      switch (provider) {
        case "ollama": {
          const result = await callOllama(
            getEffectiveOllamaUrl(env),
            system,
            prompt,
            90_000,
            getEffectiveOllamaModel(),
          );
          return result.text;
        }
        case "openai": {
          const key = getEffectiveOpenAiKey(env);
          if (!key) throw new Error("OpenAI API key is not configured");
          const result = await callOpenAiChat(
            key,
            system,
            prompt,
            30_000,
            getEffectiveOpenAiModel(),
          );
          return result.text;
        }
        case "anthropic": {
          const key = getEffectiveAnthropicKey(env);
          if (!key) throw new Error("Anthropic API key is not configured");
          const result = await callAnthropic(
            key,
            system,
            prompt,
            30_000,
            getEffectiveAnthropicModel(),
          );
          return result.text;
        }
        case "puter": {
          const token = getEffectivePuterAuthToken(env);
          if (!token) throw new Error("Puter auth token is not configured");
          const result = await callPuter(
            token,
            system,
            prompt,
            30_000,
            getEffectivePuterModel(),
            getEffectivePuterAppOrigin(env),
          );
          return result.text;
        }
      }
    } catch (err) {
      log?.warn({ err, provider }, "LLM provider failed for copilot chat, trying fallback");
      errors.push(err);
    }
  }

  const last = errors[errors.length - 1];
  throw last instanceof Error ? last : new Error("All LLM providers in the chain failed");
}

function parseHeuristicIntent(
  message: string,
  summaries: any[],
  isLlmFailure = false,
): {
  response: string;
  intent: string;
  targetPod: string | null;
  targetNamespace: string | null;
  targetDeployment: string | null;
  scaleReplicas: number | null;
} {
  const msg = message.toLowerCase();
  
  let intent = "none";
  let targetPod: string | null = null;
  let targetNamespace: string | null = null;
  let targetDeployment: string | null = null;
  let scaleReplicas: number | null = null;

  // 1. Detect target namespace if explicitly mentioned (e.g., "in namespace sit-sms" or "in sit-sms")
  const nsMatch = msg.match(/(?:in namespace|in ns|namespace)\s+([a-zA-Z0-9_-]+)/i);
  if (nsMatch) {
    targetNamespace = nsMatch[1];
  }

  // Helper to extract a word after a keyword (e.g., "diagnose pod-abc" -> "pod-abc")
  const getWordAfter = (keywords: string[]): string | null => {
    for (const kw of keywords) {
      const idx = msg.indexOf(kw);
      if (idx !== -1) {
        const remaining = msg.slice(idx + kw.length).trim();
        const words = remaining.split(/\s+/);
        if (words[0] && words[0].length > 0) {
          // Clean up trailing punctuation
          return words[0].replace(/[,.;!?()]/g, "");
        }
      }
    }
    return null;
  };

  // 2. Classify intents and extract targets (specific patterns — avoid matching random words)
  if (
    /\b(scan|check)\s+(the\s+)?cluster\b/i.test(msg) ||
    msg.includes("cluster scan") ||
    msg.includes("scan cluster")
  ) {
    intent = "scan-cluster";
  } else if (
    msg.includes("show pods") ||
    msg.includes("get pods") ||
    msg.includes("list pods") ||
    /\b(list|show|get)\s+(me\s+)?(all\s+)?(the\s+)?pods\b/i.test(msg) ||
    /\b(list|show|get)\s+(the\s+)?(name|names)\s+of\s+(the\s+)?pods\b/i.test(msg) ||
    /\bwhich pods\b/i.test(msg) ||
    /\bwhat pods\b/i.test(msg) ||
    /\bunhealthy pods\b/i.test(msg) ||
    /\bfailing pods\b/i.test(msg) ||
    /\bpods\s+(are\s+)?(unhealthy|failing|down)\b/i.test(msg) ||
    /\b(which|what)\s+pods\s+(are\s+)?(unhealthy|failing|down)\b/i.test(msg)
  ) {
    intent = "list-pods";
  } else if (
    /\b(list|show|get)\s+(me\s+)?(all\s+)?(the\s+)?(statefulsets?|daemonsets?)\b/i.test(msg)
  ) {
    intent = "list-pods";
  } else if (
    /\b(list|show|get)\s+(me\s+)?(all\s+)?(the\s+)?(nodes|namespaces|deployments|services|nodepools|nodeclaims)\b/i.test(msg) ||
    /^list (nodes|namespaces|deployments|services|nodepools|nodeclaims)$/i.test(msg.trim()) ||
    /^spell (nodes|pods|namespaces|nodepools|nodeclaims|deployments|services) names$/i.test(
      msg.trim(),
    )
  ) {
    intent = "general-chat";
  } else if (
    msg.includes("diagnose") ||
    msg.includes("troubleshoot") ||
    msg.includes("debug") ||
    /\bwhy is .+ (pod|failing|crash|down)\b/i.test(msg)
  ) {
    intent = "diagnose-pod";
    targetPod = getWordAfter(["diagnose pod", "diagnose", "troubleshoot", "debug", "why is"]);
  } else if (msg.includes("heal") || msg.includes("fix") || msg.includes("repair") || msg.includes("remediate")) {
    intent = "heal-pod";
    targetPod = getWordAfter(["heal pod", "heal", "fix pod", "fix", "repair pod", "repair"]);
  } else if (msg.includes("restart") || msg.includes("recreate") || msg.includes("bounce") || msg.includes("delete")) {
    intent = "restart-pod";
    // Check if they said "restart deployment" or "restart pod"
    if (msg.includes("deployment")) {
      targetDeployment = getWordAfter(["restart deployment", "deployment"]);
    } else {
      const maybePod = getWordAfter(["restart pod", "restart", "recreate", "delete", "bounce"]);
      // See if this is a deployment or pod name by matching with summaries
      if (maybePod) {
        const isPod = summaries.some((p) => p.name.toLowerCase().includes(maybePod.toLowerCase()));
        if (isPod) {
          targetPod = maybePod;
        } else {
          // Fall back to deployment restart
          targetDeployment = maybePod;
        }
      }
    }
  } else if (msg.includes("scale") || msg.includes("resize") || msg.includes("replicas")) {
    intent = "scale-deployment";
    targetDeployment = getWordAfter(["scale deployment", "scale", "resize deployment", "resize"]);
    
    // Extract replica count number
    const numMatch = msg.match(/\b(\d+)\b/);
    if (numMatch) {
      scaleReplicas = parseInt(numMatch[1], 10);
    }
  } else if (
    /\b(cluster health|health of (the |my )?cluster|cluster status|health check)\b/i.test(msg) ||
    /\b(how healthy|overall health)\b/i.test(msg) ||
    /\bhow (is|are) (the |my )?cluster\b/i.test(msg)
  ) {
    intent = "cluster-health";
  } else if (msg.trim().length > 0) {
    intent = "general-chat";
  }

  const isActionIntent = [
    "scan-cluster",
    "list-pods",
    "diagnose-pod",
    "heal-pod",
    "restart-pod",
    "scale-deployment",
  ].includes(intent);

  // 3. Draft a beautiful assistant response
  const modeHeader = isLlmFailure
    ? `⚠️ **LLM Provider Failure:** I encountered an issue contacting the configured LLM provider, so I've temporarily fallen back to local heuristic matching.`
    : `ℹ️ **Running in Local/Heuristic Mode:** No LLM providers are configured in Rezolv settings. I've activated local heuristic parsing so you can still manage your cluster. Configure **Ollama**, **OpenAI**, **Claude**, or **Puter.js** in [Settings](/dashboard/settings) to enable full conversational AI reasoning.`;

  let response = "";
  if (intent === "scan-cluster" || intent === "list-pods") {
    response = `${modeHeader}\n\nI have scanned the cluster and compiled the current pod listing for you.`;
  } else if (intent === "diagnose-pod" && targetPod) {
    response = `${modeHeader}\n\nI've initiated the diagnostic pipeline for pod \`${targetPod}\`.`;
  } else if (intent === "heal-pod" && targetPod) {
    response = `${modeHeader}\n\nI will attempt to trigger the healing runbook for pod \`${targetPod}\`.`;
  } else if (intent === "restart-pod") {
    if (targetDeployment) {
      response = `${modeHeader}\n\nI will trigger a rollout restart for deployment \`${targetDeployment}\`.`;
    } else if (targetPod) {
      response = `${modeHeader}\n\nI will delete pod \`${targetPod}\` to trigger a restart.`;
    } else {
      response = `${modeHeader}\n\nPlease specify the name of the pod or deployment you want to restart.`;
    }
  } else if (intent === "scale-deployment") {
    if (targetDeployment && scaleReplicas !== null) {
      response = `${modeHeader}\n\nI will scale deployment \`${targetDeployment}\` to \`${scaleReplicas}\` replicas.`;
    } else {
      response = `${modeHeader}\n\nPlease specify the deployment name and the desired number of replicas to scale (e.g., "scale deployment web-app to 3 replicas").`;
    }
  } else if (intent === "cluster-health") {
    const unhealthy = summaries.filter((p) => p.issueType || !p.ready);
    response = `${modeHeader}\n\nCluster has ${summaries.length} pods: ${summaries.length - unhealthy.length} healthy and ${unhealthy.length} unhealthy. (Configure an LLM or ask again for live node/deployment counts.)`;
  } else if (intent === "general-chat") {
    response = isLlmFailure
      ? `${modeHeader}\n\nI can answer Kubernetes and cluster questions when an LLM provider is configured in Settings.`
      : `${modeHeader}\n\nConfigure an LLM provider in [Settings](/dashboard/settings) and click **Test via agent** to enable full conversational answers.`;
  } else {
    // Fallback suggestions
    response = `${modeHeader}\n\nI can help you monitor, diagnose, and repair your cluster. Try one of these actions:\n- *What pods are currently unhealthy?*\n- *Diagnose pod ${summaries[0]?.name || "auth-service"}*\n- *Restart deployment ${summaries[0]?.name?.split("-")[0] || "web-app"}*\n- *Scale deployment web-app to 3 replicas*`;
  }

  return {
    response,
    intent,
    targetPod,
    targetNamespace,
    targetDeployment,
    scaleReplicas,
  };
}

export const copilotPlugin: FastifyPluginAsync<{ deps: ServerDeps }> = async (
  app,
  opts,
) => {
  app.addHook("onRequest", app.authenticate);

  app.post("/chat", async (request, reply) => {
    const bodySchema = z.object({
      clusterId: z.string().uuid(),
      message: z.string().min(1),
      /** Original speech transcript before normalization (voice mode). */
      rawMessage: z.string().optional(),
      /** Shorter plain-text replies for voice UI (no markdown). */
      voiceMode: z.boolean().optional().default(false),
      history: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          }),
        )
        .default([]),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { clusterId, history, voiceMode } = parsed.data;
    const rawInput = parsed.data.message;

    const conversation = resolveMeshyConversationTurn(rawInput, history, voiceMode);
    if (conversation.kind === "clarify") {
      return reply.send({
        message: conversation.question,
        uiCard: null,
        ...(voiceMode ? { voiceScript: [conversation.question] } : {}),
      });
    }
    if (conversation.kind === "cancel") {
      return reply.send({
        message: conversation.message,
        uiCard: null,
        ...(voiceMode ? { voiceScript: [conversation.message] } : {}),
      });
    }

    const { normalized: message } = normalizeKubernetesInput(
      conversation.kind === "continue" ? conversation.message : rawInput,
    );

    if (!isKubernetesRelated(message, { voiceMode })) {
      const offTopic = meshyOffTopicMessage(voiceMode);
      return reply.send({
        message: offTopic,
        uiCard: null,
        ...(voiceMode ? { voiceScript: [offTopic] } : {}),
      });
    }

    const intentHint = buildMeshyIntentHint(message, parsed.data.rawMessage);

    try {
      await verifyClusterOwnership(opts.deps.db, clusterId, request.user.userId);

      const [clusterRow] = await opts.deps.db
        .select({
          name: clusters.name,
          contextName: clusters.contextName,
          serverUrl: clusters.serverUrl,
        })
        .from(clusters)
        .where(
          and(
            eq(clusters.id, clusterId),
            eq(clusters.ownerId, request.user.userId),
          ),
        )
        .limit(1);

      if (!clusterRow) {
        return reply.code(404).send({ error: "Cluster not found" });
      }

      const connection = await getClusterConnection(
        opts.deps.db,
        opts.deps.env,
        clusterId,
        request.user.userId,
        opts.deps.watcher,
      );

      // 2. Live cluster data via Kubernetes API (not stale informer cache)
      const summaries = await listPodSummaries(
        opts.deps.db,
        opts.deps.watcher,
        clusterId,
        connection,
      );
      const clusterContext = await fetchMeshyClusterContext(connection, summaries);
      const liveContextBlock = formatMeshyClusterContext(clusterContext, {
        name: clusterRow.name,
        contextName: clusterRow.contextName,
        serverUrl: clusterRow.serverUrl,
      });

      // 3. Parse intent using local heuristic matching first
      const heuristicResult = parseHeuristicIntent(message, summaries);
      const parsedJson = {
        intent: heuristicResult.intent,
        targetPod: heuristicResult.targetPod,
        targetNamespace: heuristicResult.targetNamespace,
        targetDeployment: heuristicResult.targetDeployment,
        scaleReplicas: heuristicResult.scaleReplicas,
        response: heuristicResult.response,
      };

      const msgLower = message.toLowerCase();
      const asksClusterName =
        /\b(cluster name|name of (the |my )?cluster)\b/i.test(msgLower) ||
        /\bwhat('s| is) (the |my )?cluster called\b/i.test(msgLower) ||
        /\bwhat('s| is) (the |my )?cluster name\b/i.test(msgLower) ||
        /\bwhich cluster am i\b/i.test(msgLower) ||
        /\btell me (the |my )?cluster name\b/i.test(msgLower);
      if (asksClusterName) {
        parsedJson.intent = "cluster-info";
      }

      const configuredChain = getConfiguredChain(opts.deps.env);

      // Open-ended questions should use the LLM, not pod-count heuristics.
      if (
        configuredChain.length > 0 &&
        parsedJson.intent === "cluster-health"
      ) {
        parsedJson.intent = "general-chat";
      }

      // Voice STT is imperfect — use LLM unless the user clearly asked to list/scan pods.
      if (
        voiceMode &&
        configuredChain.length > 0 &&
        POD_LIST_INTENTS.has(parsedJson.intent) &&
        !isExplicitPodListRequest(message)
      ) {
        parsedJson.intent = "general-chat";
      }

      const isConversational =
        parsedJson.intent === "general-chat" ||
        parsedJson.intent === "cluster-info";

      const listMessage = resolveListMessage(message, history);
      const answerMessage = listMessage !== message ? listMessage : message;
      const isSpellNamesRequest = /^spell (nodes|pods|deployments|services|namespaces|nodepools|nodeclaims) names$/i.test(
        answerMessage,
      );

      const directAnswer = tryMeshyDirectAnswer(
        answerMessage,
        clusterContext,
        {
          name: clusterRow.name,
          contextName: clusterRow.contextName,
          serverUrl: clusterRow.serverUrl,
        },
        voiceMode,
      );
      const chatDirectAnswer = voiceMode
        ? tryMeshyDirectAnswer(
            answerMessage,
            clusterContext,
            {
              name: clusterRow.name,
              contextName: clusterRow.contextName,
              serverUrl: clusterRow.serverUrl,
            },
            false,
          )
        : directAnswer;

      if (chatDirectAnswer) {
        parsedJson.response = chatDirectAnswer;
        if (parsedJson.intent === "cluster-info") {
          parsedJson.intent = "general-chat";
        }
      } else if (
        configuredChain.length > 0 &&
        !isSpellNamesRequest &&
        parsedJson.intent !== "cluster-info"
      ) {
        try {
          const historyText = history
            .slice(-8)
            .map((h) => `${h.role}: ${h.content}`)
            .join("\n");

          const systemPrompt = voiceMode
            ? isConversational
              ? `${MESHY_VOICE_SYSTEM_STYLE}
The user's words may come from speech-to-text with typos, missing words, or homophones — infer what they meant from the full sentence and conversation history.
Answer the user's question directly. Do not lead with pod counts unless they asked about pods, nodes, or cluster health.
For general Kubernetes concepts, explain clearly using live data when relevant.`
              : `${MESHY_VOICE_SYSTEM_STYLE}
Confirm what you did in a friendly, natural way — one or two sentences is enough.`
            : isConversational
              ? `You are Meshy, the user's friendly Kubernetes assistant.
Answer using ONLY facts from the LIVE CLUSTER DATA section below. Do not invent resource names, counts, or statuses.
User input may contain typos or speech-to-text errors — infer intent from context.
Answer the user's question directly and specifically.
Do not lead with pod counts unless they asked about pods, nodes, deployments, services, or cluster health.
For general Kubernetes concepts, explain clearly and tie in live data when relevant.
When listing multiple resource names, use a markdown bullet list with one item per line.
Keep responses concise (2-4 sentences) and use markdown sparingly.`
              : `You are Meshy, the user's Kubernetes assistant.
Write a friendly, natural response. Do NOT use placeholder values or echo instructions.
Keep your response short (2-3 sentences max) and formatted in markdown.`;

          const prompt = isConversational
            ? `Conversation history:
${historyText || "(none)"}

User question (may contain speech-to-text errors): "${message}"
Intent hint: ${intentHint}

Use the conversation history to resolve follow-ups like "list them", "yes", or "can you list down" — refer to what was just discussed.

${liveContextBlock}

Answer what the user meant using only the live cluster data above. If they ask for the cluster name, say "${clusterRow.name}" exactly.`
            : `User query (may contain speech-to-text errors): "${message}"
Intent hint: ${intentHint}
Identified action to take: "${parsedJson.intent}"
Target Pod: ${parsedJson.targetPod || "none"}
Target Namespace: ${parsedJson.targetNamespace || "none"}
Target Deployment: ${parsedJson.targetDeployment || "none"}
Scale Replicas: ${parsedJson.scaleReplicas !== null ? parsedJson.scaleReplicas : "none"}

${liveContextBlock}

Write a natural, friendly response confirming this action. Never say "checking now".`;

          const rawResponse = await completeChat(opts.deps.env, systemPrompt, prompt, app.log);
          if (rawResponse && rawResponse.trim().length > 0) {
            parsedJson.response = rawResponse.trim();
          }
        } catch (llmErr) {
          app.log.warn({ err: llmErr }, "LLM completion failed, using fallback heuristic response");
          const hint =
            llmErr instanceof Error &&
            (llmErr.message.includes("not configured") ||
              llmErr.message.includes("API key"))
              ? " Add your API key in Settings, click Test via agent, then ensure OpenAI is in your provider chain."
              : "";

          if (ACTION_INTENTS.has(parsedJson.intent)) {
            parsedJson.response = parseHeuristicIntent(
              message,
              summaries,
              true,
            ).response.replace(
              "Configure **Ollama**, **OpenAI**, **Claude**, or **Puter.js** in [Settings](/dashboard/settings)",
              `Configure and **Apply** your LLM provider in [Settings](/dashboard/settings)${hint}`,
            );
          } else {
            parsedJson.intent = "general-chat";
            parsedJson.response =
              `⚠️ **LLM Provider Failure:** I couldn't reach your configured LLM provider.${hint}\n\n` +
              "Open [Settings](/dashboard/settings), verify your provider chain, and click **Test via agent**.";
          }
        }
      }

      const intent = parsedJson.intent;
      let uiCard: Record<string, unknown> | null = null;
      let finalMessage = parsedJson.response;

      // 5. Route intent logic
      if (intent === "cluster-info") {
        finalMessage =
          directAnswer ??
          (voiceMode
            ? `You're connected to the ${clusterRow.name} cluster, running Kubernetes ${clusterContext.version}.`
            : `Your connected cluster is **${clusterRow.name}**.\n- Kubernetes: \`${clusterContext.version}\`\n- Context: \`${clusterRow.contextName}\`\n- API server: \`${clusterRow.serverUrl}\``);
      } else if (intent === "cluster-health") {
        finalMessage =
          directAnswer ??
          formatClusterHealthSummary(clusterContext, clusterRow.name, voiceMode);
      } else if (POD_LIST_INTENTS.has(intent)) {
        uiCard = {
          type: "pod-list",
          data: {
            pods: summaries,
          },
        };
      } else if (intent === "general-chat") {
        // Conversational answer only — no forced pod list card
      } else if (intent === "diagnose-pod" && parsedJson.targetPod) {
        const queryName = parsedJson.targetPod.toLowerCase();
        const target = summaries.find(
          (p) =>
            p.name.toLowerCase().includes(queryName) &&
            (!parsedJson.targetNamespace || p.namespace === parsedJson.targetNamespace),
        );

        if (!target) {
          finalMessage = `I searched for a pod matching "${parsedJson.targetPod}" in the cluster, but couldn't find one. Could you verify the pod name?`;
        } else {
          // Perform full diagnosis
          const v1Pod = await connection.readPod(target.name, target.namespace);
          if (!v1Pod) {
            finalMessage = `I tried to read pod "${target.name}" from the Kubernetes API, but it seems to have been deleted.`;
          } else {
            // Check for existing pending heal
            const [existingHeal] = await opts.deps.db
              .select()
              .from(healRecords)
              .where(
                and(
                  eq(healRecords.clusterId, clusterId),
                  eq(healRecords.podName, target.name),
                  eq(healRecords.namespace, target.namespace),
                  eq(healRecords.status, "pending"),
                ),
              )
              .limit(1);

            let healRecordId: string;
            let diagnosisResult: any;

            if (existingHeal) {
              healRecordId = existingHeal.id;
              const beforeState = (existingHeal.beforeState || {}) as Record<string, any>;
              diagnosisResult = {
                rootCause: existingHeal.llmReasoning.split("\n")[0] || "Diagnosed issue",
                severity: existingHeal.severity,
                action: existingHeal.actionTaken,
                reasoning: existingHeal.llmReasoning,
                safeToAutoHeal: beforeState.safeToAutoHeal === true,
                patchSpec: beforeState.patchSpec,
              };
            } else {
              const reasoner = new PodReasoner({ env: opts.deps.env, log: app.log });
              const issueType = detectIssue(v1Pod) || "Pending";
              const restartCount = getPodRestartCount(v1Pod);
              const logs = (await connection.getPodLogs(target.name, target.namespace, true, 80)) ?? "";
              const k8sEvents = (await connection.getPodEvents(target.name, target.namespace)) ?? [];
              const events = formatEvents(k8sEvents);

              diagnosisResult = await reasoner.diagnosePod({
                podName: target.name,
                namespace: target.namespace,
                issueType,
                restartCount,
                logs,
                events,
              });

              const workload = await connection.resolveWorkloadForPod(target.name, target.namespace);
              let memoryApproval;
              if (issueType === "OOM") {
                memoryApproval = (await buildOomMemorySnapshot(
                  v1Pod,
                  workload
                    ? { kind: workload.kind as any, name: workload.name, namespace: target.namespace }
                    : null,
                  connection,
                  opts.deps.env.MAX_MEMORY_LIMIT || "4Gi",
                )) ?? undefined;
              }

              const [newRow] = await opts.deps.db
                .insert(healRecords)
                .values({
                  clusterId,
                  podName: target.name,
                  namespace: target.namespace,
                  issueType,
                  severity: diagnosisResult.severity,
                  llmReasoning: diagnosisResult.reasoning,
                  actionTaken: diagnosisResult.action,
                  status: "pending",
                  durationMs: 0,
                  beforeState: {
                    phase: v1Pod.status?.phase,
                    containerStatuses: v1Pod.status?.containerStatuses,
                    conditions: v1Pod.status?.conditions,
                    labels: v1Pod.metadata?.labels,
                    safeToAutoHeal: diagnosisResult.safeToAutoHeal,
                    approvalRequired: true,
                    patchSpec: diagnosisResult.patchSpec,
                    deploymentName: workload?.kind === "Deployment" ? workload.name : undefined,
                    workloadKind: workload?.kind,
                    workloadName: workload?.name,
                    ...(memoryApproval ? { memoryApproval } : {}),
                  },
                  afterState: {},
                })
                .returning({ id: healRecords.id });

              healRecordId = newRow.id;
            }

            uiCard = {
              type: "diagnosis",
              data: {
                healRecordId,
                podName: target.name,
                namespace: target.namespace,
                rootCause: diagnosisResult.rootCause,
                severity: diagnosisResult.severity,
                action: diagnosisResult.action,
                reasoning: diagnosisResult.reasoning,
                safeToAutoHeal: diagnosisResult.safeToAutoHeal,
                patchSpec: diagnosisResult.patchSpec,
              },
            };

            finalMessage = voiceMode
              ? `I looked at ${target.name} in ${target.namespace}. The root cause looks like ${diagnosisResult.rootCause}, and I'd recommend ${diagnosisResult.action}. You can approve the fix right here in chat when you're ready.`
              : `I've diagnosed pod \`${target.name}\` in namespace \`${target.namespace}\`.
**Root Cause:** ${diagnosisResult.rootCause}
**Recommended Action:** ${diagnosisResult.action} (Severity: ${diagnosisResult.severity})

You can approve the self-healing remediation directly below.`;
          }
        }
      } else if (intent === "heal-pod" && parsedJson.targetPod) {
        const queryName = parsedJson.targetPod.toLowerCase();
        const target = summaries.find(
          (p) =>
            p.name.toLowerCase().includes(queryName) &&
            (!parsedJson.targetNamespace || p.namespace === parsedJson.targetNamespace),
        );

        if (!target) {
          finalMessage = `I searched for a pod matching "${parsedJson.targetPod}" to heal, but couldn't find one.`;
        } else {
          const result = await opts.deps.watcher.triggerManualHeal(
            clusterId,
            target.namespace,
            target.name,
          );

          if (!result.ok) {
            finalMessage = `Failed to trigger healing for pod ${target.name}: ${result.error}`;
          } else {
            uiCard = {
              type: "heal-trigger",
              data: {
                success: true,
                podName: target.name,
                namespace: target.namespace,
              },
            };
            finalMessage = `I have successfully initiated the healing pipeline for pod \`${target.name}\` in namespace \`${target.namespace}\`. Check the Heal log page to track live progress!`;
          }
        }
      } else if (intent === "restart-pod") {
        const targetNamespace = parsedJson.targetNamespace || "default";

        if (parsedJson.targetDeployment) {
          await connection.rolloutRestart(parsedJson.targetDeployment, targetNamespace);
          uiCard = {
            type: "action-result",
            data: {
              success: true,
              action: "restart",
              name: parsedJson.targetDeployment,
              type: "deployment",
              namespace: targetNamespace,
              message: `Rollout restart for deployment "${parsedJson.targetDeployment}" initiated.`,
            },
          };
          finalMessage = `Initiated rollout restart of deployment \`${parsedJson.targetDeployment}\` in namespace \`${targetNamespace}\`.`;
        } else if (parsedJson.targetPod) {
          const queryName = parsedJson.targetPod.toLowerCase();
          const target = summaries.find(
            (p) => p.name.toLowerCase().includes(queryName) && p.namespace === targetNamespace,
          );

          if (!target) {
            finalMessage = `Could not find any pod matching "${parsedJson.targetPod}" in namespace "${targetNamespace}" to restart.`;
          } else {
            await connection.deletePod(target.name, target.namespace);
            uiCard = {
              type: "action-result",
              data: {
                success: true,
                action: "restart",
                name: target.name,
                type: "pod",
                namespace: target.namespace,
                message: `Pod deleted successfully. Kubernetes will recreate it.`,
              },
            };
            finalMessage = `Deleted pod \`${target.name}\` in namespace \`${target.namespace}\` to trigger a restart.`;
          }
        } else {
          finalMessage = "Please specify the pod or deployment name you want to restart.";
        }
      } else if (intent === "scale-deployment" && parsedJson.targetDeployment && parsedJson.scaleReplicas !== null) {
        const targetNamespace = parsedJson.targetNamespace || "default";
        const replicas = parsedJson.scaleReplicas;

        await connection.scaleDeployment(parsedJson.targetDeployment, targetNamespace, replicas);

        uiCard = {
          type: "action-result",
          data: {
            success: true,
            action: "scale",
            name: parsedJson.targetDeployment,
            namespace: targetNamespace,
            replicas,
            message: `Successfully scaled deployment to ${replicas} replicas.`,
          },
        };
        finalMessage = `Scaled deployment \`${parsedJson.targetDeployment}\` in namespace \`${targetNamespace}\` to \`${replicas}\` replicas.`;
      }

      return reply.code(200).send({
        message: formatMeshyCommaListReply(finalMessage),
        uiCard,
        ...(voiceMode
          ? {
              voiceChatMessage: formatMeshyCommaListReply(
                chatDirectAnswer ?? finalMessage,
              ),
              voiceScript: splitListOfferVoiceScript(
                ensureVoiceListSpellOffer(
                  answerMessage,
                  history,
                  buildMeshyVoiceScript({
                    message: answerMessage,
                    voiceAnswer: directAnswer ?? parsedJson.response ?? finalMessage,
                    conversation: { kind: "continue", message: answerMessage },
                    history,
                    ctx: {
                      nodeCount: clusterContext.nodeCount,
                      readyNodeCount: clusterContext.readyNodeCount,
                      namespaces: clusterContext.namespaces,
                      nodes: clusterContext.nodes,
                      pods: clusterContext.pods,
                      deploymentCount: clusterContext.deploymentCount,
                      serviceCount: clusterContext.serviceCount,
                      nodepools: clusterContext.nodepools,
                      nodeclaims: clusterContext.nodeclaims,
                      podStats: clusterContext.podStats,
                    },
                  }),
                ),
              ),
            }
          : {}),
      });
    } catch (err) {
      app.log.error(err, "error in copilot chat api");
      return reply.code(500).send({ error: err instanceof Error ? err.message : "Internal Server Error" });
    }
  });
};
