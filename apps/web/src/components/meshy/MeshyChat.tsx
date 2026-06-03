/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Send,
  Loader2,
  AlertTriangle,
  Play,
  Sliders,
  CheckCircle2,
  Box,
  ExternalLink,
  X,
  Square,
  Trash2,
} from "lucide-react";
import { AnimatedVoiceAssistantIcon } from "@/components/meshy/AnimatedVoiceAssistantIcon";
import { MeshyMessageContent } from "@/components/meshy/MeshyMessageContent";
import { useClusterStore } from "@/stores/cluster";
import { useAgentToken } from "@/hooks/useAgentToken";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import { approveHeal, fetchLlmConfig } from "@/lib/api";
import { speakMeshyText } from "@/lib/meshy-tts";
import { meshyLanguageToSpeechRecognitionLang } from "@/lib/meshy-voice-language";
import { summarizeForVoice } from "@/lib/voice";
import { mergeTranscriptPartsFrom } from "@/lib/voice-transcript";
import {
  createMeshySpeechRecognition,
  destroyMeshySpeechRecognition,
  startMeshySpeechRecognition,
  stopMeshySpeechRecognition,
} from "@/lib/meshy-speech-recognition";
import { VoiceActivityMonitor } from "@/lib/voice-vad";
import { useMeshy } from "@/stores/meshy";
import { useSettingsStore } from "@/stores/settings";
import {
  clearMeshyChatMessages,
  loadMeshyChatMessages,
  saveMeshyChatMessages,
  type StoredMeshyMessage,
} from "@/lib/meshy-chat-storage";
import {
  isAffirmativeReply,
  isKubernetesRelated,
  isNegativeReply,
  meshyOffTopicMessage,
  normalizeKubernetesInput,
  parsePendingClarification,
  parsePendingSpellOffer,
  resolveMeshyConversationTurn,
  ensureVoiceListSpellOffer,
  isDeclineListRequest,
  splitListOfferVoiceScript,
  voiceWorkingAck,
} from "@kubehealer/shared";
import type { LlmConfigResponse } from "@/types/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const MESHY_VOICE_GREETING =
  "Hello Sir, I'm Meshy, your Kubernetes assistant. What would you like to know about your cluster?";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  inputNote?: string;
  uiCard?: {
    type: string;
    data: any;
  };
}

interface VoiceTurn {
  user: string;
  userNote?: string;
  /** Shown in the voice modal. */
  assistant: string;
  /** Used for yes/no follow-ups (e.g. spell offer) and API history. */
  assistantContext?: string;
  uiCard?: Message["uiCard"];
}

const MESHY_WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello Sir! I'm **Meshy**, your Kubernetes assistant. Ask me anything about your cluster — health, pod issues, diagnostics, or general questions.",
};

export function MeshyChat() {
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const token = useAgentToken();
  const { hfToken, useHuggingFace, voiceGender, voiceLanguage } = useMeshy();
  const meshyChatRetention = useSettingsStore((s) => s.meshyChatRetention);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const settingsHydrated = useSettingsStore((s) => s.hydrated);

  const [messages, setMessages] = useState<Message[]>([MESHY_WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [llmConfig, setLlmConfig] = useState<LlmConfigResponse | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const voiceScrollEndRef = useRef<HTMLDivElement>(null);

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [actionDone, setActionDone] = useState<Record<string, boolean>>({});
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Voice Interaction State
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceTranscriptFinal, setVoiceTranscriptFinal] = useState("");
  const [voiceTranscriptInterim, setVoiceTranscriptInterim] = useState("");
  const [voiceResponse, setVoiceResponse] = useState("");
  const [voiceTurns, setVoiceTurns] = useState<VoiceTurn[]>([]);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [voicePhase, setVoicePhase] = useState<
    "monitoring" | "speaking" | "processing" | "responding"
  >("monitoring");
  const [micLevel, setMicLevel] = useState(0);
  const recognitionRef = useRef<any>(null);
  const voiceAutoSubmitRef = useRef<(transcript: string) => void>(() => {});
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const speakGenerationRef = useRef(0);
  const pendingTranscriptRef = useRef("");
  const voiceSubmittingRef = useRef(false);
  const voiceTurnGenerationRef = useRef(0);
  const voiceFetchAbortRef = useRef<AbortController | null>(null);
  const isFirstVoiceTurnRef = useRef(true);
  const vadRef = useRef<VoiceActivityMonitor | null>(null);
  const vadPausedRef = useRef(false);
  const vadSubmitPendingRef = useRef(false);
  const recognitionActiveRef = useRef(false);
  const showVoiceModalRef = useRef(false);
  const utteranceActiveRef = useRef(false);
  const utteranceStartIndexRef = useRef(0);
  const lastResultIndexRef = useRef(0);
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MIN_VOICE_CHARS = 3;
  /** Small buffer after VAD silence so STT can finalize the last word. */
  const FINALIZE_MS = 300;
  const RECOGNITION_START_DELAY_MS = 450;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollVoiceToBottom = (behavior: ScrollBehavior = "smooth") => {
    voiceScrollEndRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  useEffect(() => {
    if (!settingsHydrated) hydrateSettings();
  }, [settingsHydrated, hydrateSettings]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    if (!activeClusterId) {
      setMessages([MESHY_WELCOME_MESSAGE]);
      return;
    }

    const stored = loadMeshyChatMessages(activeClusterId, meshyChatRetention);
    if (stored && stored.length > 0) {
      setMessages(stored as Message[]);
      return;
    }

    setMessages([MESHY_WELCOME_MESSAGE]);
  }, [activeClusterId, meshyChatRetention.value, meshyChatRetention.unit]);

  useEffect(() => {
    if (!activeClusterId) return;

    const timer = window.setTimeout(() => {
      const persistable = messages.filter((message) => message.id !== "welcome");
      if (persistable.length === 0) return;
      saveMeshyChatMessages(
        activeClusterId,
        persistable as StoredMeshyMessage[],
      );
    }, 400);

    return () => window.clearTimeout(timer);
  }, [activeClusterId, messages]);

  useEffect(() => {
    if (!showVoiceModal) return;
    scrollVoiceToBottom();
  }, [
    showVoiceModal,
    voiceTurns,
    voiceTranscriptFinal,
    voiceTranscriptInterim,
    voiceProcessing,
    voiceResponse,
    voicePhase,
  ]);

  useEffect(() => {
    if (!token) return;
    fetchLlmConfig(token)
      .then(setLlmConfig)
      .catch((err) => console.error("Failed to fetch LLM config:", err));
  }, [token]);

  const prepareUserInput = (raw: string) => normalizeKubernetesInput(raw.trim());

  const liveVoiceDisplay = useMemo(() => {
    const raw = [voiceTranscriptFinal, voiceTranscriptInterim]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!raw) return null;
    const { normalized, corrections } = prepareUserInput(raw);
    return { raw, normalized, corrections };
  }, [voiceTranscriptFinal, voiceTranscriptInterim]);

  const isMeshySpeaking = () => {
    const audio = ttsAudioRef.current;
    if (audio && !audio.paused && !audio.ended) return true;
    if (typeof window !== "undefined" && window.speechSynthesis?.speaking) {
      return true;
    }
    return false;
  };

  const cancelInFlightVoiceTurn = () => {
    stopSpeaking();
    voiceFetchAbortRef.current?.abort();
    voiceFetchAbortRef.current = null;
    vadSubmitPendingRef.current = false;
    clearFinalizeTimer();
    clearRecognitionStartTimer();
    if (recognitionRef.current && recognitionActiveRef.current) {
      stopMeshySpeechRecognition(recognitionRef.current);
      recognitionActiveRef.current = false;
    }
  };

  /** Stop TTS/API for the current turn — used when the user barges in. */
  const beginVoiceTurn = () => {
    voiceTurnGenerationRef.current += 1;
    cancelInFlightVoiceTurn();
    voiceSubmittingRef.current = false;
    setVoiceProcessing(false);
    return voiceTurnGenerationRef.current;
  };

  const stopSpeaking = () => {
    speakGenerationRef.current += 1;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
    const audio = ttsAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      if (audio.src.startsWith("blob:")) {
        URL.revokeObjectURL(audio.src);
      }
      ttsAudioRef.current = null;
    }
  };

  useEffect(() => {
    showVoiceModalRef.current = showVoiceModal;
  }, [showVoiceModal]);

  const pauseVad = () => {
    vadPausedRef.current = true;
    vadRef.current?.setPaused(true);
  };

  const unpauseVad = () => {
    vadPausedRef.current = false;
    vadRef.current?.setPaused(false);
  };

  /** Re-open the mic pipeline for the next voice turn after Meshy finishes. */
  const resumeListening = () => {
    if (!showVoiceModalRef.current) return;

    clearFinalizeTimer();
    clearRecognitionStartTimer();
    utteranceActiveRef.current = false;
    pendingTranscriptRef.current = "";
    setVoiceTranscript("");
    setVoiceTranscriptFinal("");
    setVoiceTranscriptInterim("");

    unpauseVad();
    setVoicePhase("monitoring");
  };

  /** Fresh STT session per utterance — avoids stale results from warm monitoring capture. */
  const beginUtteranceRecognition = () => {
    if (
      !recognitionRef.current ||
      vadPausedRef.current ||
      !utteranceActiveRef.current
    ) {
      return;
    }

    if (recognitionActiveRef.current) {
      stopMeshySpeechRecognition(recognitionRef.current);
      recognitionActiveRef.current = false;
    }

    lastResultIndexRef.current = 0;
    utteranceStartIndexRef.current = 0;

    if (startMeshySpeechRecognition(recognitionRef.current)) {
      recognitionActiveRef.current = true;
    }
  };

  const stopVad = () => {
    vadRef.current?.stop();
    vadRef.current = null;
  };

  const clearFinalizeTimer = () => {
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
  };

  const clearRecognitionStartTimer = () => {
    if (recognitionStartTimerRef.current) {
      clearTimeout(recognitionStartTimerRef.current);
      recognitionStartTimerRef.current = null;
    }
  };

  const resetUtteranceCapture = () => {
    utteranceActiveRef.current = false;
    pendingTranscriptRef.current = "";
    setVoiceTranscript("");
    setVoiceTranscriptFinal("");
    setVoiceTranscriptInterim("");
    if (showVoiceModalRef.current && !vadPausedRef.current && !voiceSubmittingRef.current) {
      setVoicePhase("monitoring");
    }
  };

  const teardownSpeechRecognition = () => {
    clearRecognitionStartTimer();
    const recognition = recognitionRef.current;
    if (!recognition) return;

    destroyMeshySpeechRecognition(recognition);

    recognitionRef.current = null;
    recognitionActiveRef.current = false;
    vadSubmitPendingRef.current = false;
  };

  const setupSpeechRecognition = () => {
    teardownSpeechRecognition();

    const recognition = createMeshySpeechRecognition(
      {
      onStart: () => {
        if (utteranceActiveRef.current) {
          setVoicePhase("speaking");
        }
      },
      onError: (code) => {
        recognitionActiveRef.current = false;
        vadSubmitPendingRef.current = false;
        if (code === "not-allowed") {
          console.warn("Microphone permission is required for Meshy voice.");
        }
        if (showVoiceModalRef.current && !voiceSubmittingRef.current) {
          setVoicePhase("monitoring");
        }
      },
      onResult: (event: any) => {
        lastResultIndexRef.current = event.results.length;
        if (!utteranceActiveRef.current) return;

        const parts = mergeTranscriptPartsFrom(
          event.results,
          utteranceStartIndexRef.current,
        );
        if (!parts.full) return;

        const { normalized } = prepareUserInput(parts.full);
        pendingTranscriptRef.current = normalized;
        setVoiceTranscript(normalized);
        setVoiceTranscriptFinal(
          parts.finalized ? prepareUserInput(parts.finalized).normalized : "",
        );
        setVoiceTranscriptInterim(
          parts.interim ? prepareUserInput(parts.interim).normalized : "",
        );
        setVoicePhase("speaking");
      },
      onEnd: () => {
        recognitionActiveRef.current = false;

        if (vadSubmitPendingRef.current) {
          vadSubmitPendingRef.current = false;
          utteranceActiveRef.current = false;

          const captured = pendingTranscriptRef.current.trim();
          pendingTranscriptRef.current = "";
          if (
            captured.length >= MIN_VOICE_CHARS &&
            !voiceSubmittingRef.current
          ) {
            void voiceAutoSubmitRef.current(captured);
          } else if (showVoiceModalRef.current && !vadPausedRef.current) {
            setVoiceTranscript("");
            setVoiceTranscriptFinal("");
            setVoiceTranscriptInterim("");
            setVoicePhase("monitoring");
          }
          return;
        }

        // no-speech / timeout while listening — return to VAD without restarting STT.
        if (
          utteranceActiveRef.current &&
          !pendingTranscriptRef.current.trim() &&
          showVoiceModalRef.current &&
          !vadPausedRef.current &&
          !voiceSubmittingRef.current
        ) {
          resetUtteranceCapture();
        }
      },
    },
    { lang: meshyLanguageToSpeechRecognitionLang(voiceLanguage) },
    );

    if (!recognition) return false;

    recognitionRef.current = recognition;
    return true;
  };

  const startRecognitionCapture = () => {
    clearFinalizeTimer();
    clearRecognitionStartTimer();

    const isNewUtterance = !utteranceActiveRef.current;
    utteranceActiveRef.current = true;

    if (isNewUtterance) {
      pendingTranscriptRef.current = "";
      setVoiceTranscript("");
      setVoiceTranscriptFinal("");
      setVoiceTranscriptInterim("");
    }

    setVoicePhase("speaking");

    const startRecognition = () => {
      if (utteranceActiveRef.current && !vadPausedRef.current) {
        beginUtteranceRecognition();
      }
    };

    // First turn only: brief delay after VAD to avoid Chrome no-speech on noise blips.
    const delay = isFirstVoiceTurnRef.current ? RECOGNITION_START_DELAY_MS : 0;
    if (delay === 0) {
      startRecognition();
    } else {
      recognitionStartTimerRef.current = setTimeout(() => {
        recognitionStartTimerRef.current = null;
        startRecognition();
      }, delay);
    }
  };

  const finishRecognitionCapture = () => {
    if (!utteranceActiveRef.current || !recognitionRef.current) {
      clearRecognitionStartTimer();
      if (utteranceActiveRef.current && !recognitionActiveRef.current) {
        resetUtteranceCapture();
      }
      return;
    }
    clearFinalizeTimer();
    finalizeTimerRef.current = setTimeout(() => {
      finalizeTimerRef.current = null;
      if (!recognitionRef.current) return;
      if (!recognitionActiveRef.current) {
        resetUtteranceCapture();
        return;
      }
      vadSubmitPendingRef.current = true;
      stopMeshySpeechRecognition(recognitionRef.current);
    }, FINALIZE_MS);
  };

  const startVadSession = async () => {
    stopVad();
    if (!setupSpeechRecognition()) {
      alert("Speech recognition is not supported in this browser.");
      setShowVoiceModal(false);
      return;
    }
    try {
      const monitor = new VoiceActivityMonitor({
        onSpeechStart: () => {
          if (vadPausedRef.current || isMeshySpeaking()) return;
          if (voiceSubmittingRef.current) {
            beginVoiceTurn();
          }
          startRecognitionCapture();
        },
        onSpeechEnd: () => {
          finishRecognitionCapture();
        },
        onLevel: (rms, isLoud) => {
          setMicLevel(isLoud ? Math.min(1, rms * 12) : Math.min(0.35, rms * 6));
        },
      });
      await monitor.start();
      vadRef.current = monitor;
      vadPausedRef.current = false;
      setVoicePhase("monitoring");
    } catch (err) {
      console.error("Microphone access failed:", err);
      alert("Microphone access is required for voice mode. Please allow mic permission and try again.");
      setShowVoiceModal(false);
    }
  };

  /** Speak one TTS line without toggling VAD (caller manages pause/unpause). */
  const speakTextLine = async (text: string, turnId: number): Promise<void> => {
    const spoken = summarizeForVoice(text);
    if (!spoken || turnId !== voiceTurnGenerationRef.current) return;

    stopSpeaking();
    if (turnId !== voiceTurnGenerationRef.current) return;

    const generation = speakGenerationRef.current;
    const ttsAbort = new AbortController();
    ttsAbortRef.current = ttsAbort;

    await speakMeshyText(spoken, {
      useHuggingFace,
      hfToken,
      gender: voiceGender,
      language: voiceLanguage,
      rate: 0.92,
      signal: ttsAbort.signal,
      onAudio: (audio) => {
        if (
          generation === speakGenerationRef.current &&
          turnId === voiceTurnGenerationRef.current
        ) {
          ttsAudioRef.current = audio;
        }
      },
    });

    if (ttsAbortRef.current === ttsAbort) {
      ttsAbortRef.current = null;
    }
  };

  /** Speak one or more lines; VAD stays paused until done or interrupted. */
  const speakVoiceLines = async (lines: string[], turnId: number): Promise<void> => {
    if (lines.length === 0 || turnId !== voiceTurnGenerationRef.current) return;

    pauseVad();
    setVoicePhase("responding");

    try {
      for (const line of lines) {
        if (turnId !== voiceTurnGenerationRef.current) break;
        await speakTextLine(line, turnId);
      }
    } finally {
      if (turnId === voiceTurnGenerationRef.current) {
        unpauseVad();
      }
    }
  };

  /** Single utterance with VAD pause (greeting, off-topic). */
  const speakText = async (text: string, turnId: number): Promise<void> => {
    await speakVoiceLines([text], turnId);
  };

  useEffect(() => () => teardownSpeechRecognition(), []);

  useEffect(() => {
    if (!showVoiceModal || !recognitionRef.current) return;
    recognitionRef.current.lang =
      meshyLanguageToSpeechRecognitionLang(voiceLanguage);
  }, [voiceLanguage, showVoiceModal]);

  const startVoiceAssistant = async () => {
    setShowVoiceModal(true);
    setVoiceTranscript("");
    setVoiceTranscriptFinal("");
    setVoiceTranscriptInterim("");
    setVoiceResponse("");
    setVoiceTurns([]);
    setVoiceProcessing(false);
    pendingTranscriptRef.current = "";
    isFirstVoiceTurnRef.current = true;
    await startVadSession();
    const greetingTurn = voiceTurnGenerationRef.current;
    await speakText(MESHY_VOICE_GREETING, greetingTurn);
    isFirstVoiceTurnRef.current = false;
  };

  const closeVoiceAssistant = () => {
    clearFinalizeTimer();
    clearRecognitionStartTimer();
    utteranceActiveRef.current = false;
    beginVoiceTurn();
    teardownSpeechRecognition();
    stopVad();
    stopSpeaking();
    setShowVoiceModal(false);
    setVoicePhase("monitoring");
    setVoiceResponse("");
    setVoiceTurns([]);
    setVoiceProcessing(false);
    setVoiceTranscript("");
    setMicLevel(0);
  };

  const handleVoiceAutoSubmit = async (transcript: string) => {
    if (
      !transcript.trim() ||
      !activeClusterId ||
      !token ||
      voiceSubmittingRef.current
    ) {
      return;
    }

    const turnId = beginVoiceTurn();
    voiceSubmittingRef.current = true;
    clearFinalizeTimer();
    clearRecognitionStartTimer();
    utteranceActiveRef.current = false;

    if (recognitionRef.current && recognitionActiveRef.current) {
      stopMeshySpeechRecognition(recognitionRef.current);
      recognitionActiveRef.current = false;
    }

    setVoicePhase("processing");
    setVoiceProcessing(true);

    const { normalized, corrections } = prepareUserInput(transcript);
    const lastVoiceAssistant =
      voiceTurns.at(-1)?.assistantContext ?? voiceTurns.at(-1)?.assistant;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const pendingContext = lastVoiceAssistant ?? lastAssistant?.content;
    const pendingClarification = parsePendingClarification(pendingContext);
    const pendingSpell = parsePendingSpellOffer(pendingContext);
    const isShortFollowUp =
      (pendingClarification &&
        (isAffirmativeReply(normalized) || isNegativeReply(normalized))) ||
      (pendingSpell &&
        (isAffirmativeReply(normalized) || isNegativeReply(normalized))) ||
      isDeclineListRequest(normalized);

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: normalized,
      inputNote:
        corrections.length > 0
          ? `Heard: "${transcript.trim()}" · ${corrections.join(", ")}`
          : transcript.trim() !== normalized
            ? `Heard: "${transcript.trim()}"`
            : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);

    const abortController = new AbortController();
    voiceFetchAbortRef.current = abortController;

    try {
      if (!isKubernetesRelated(normalized, { voiceMode: true }) && !isShortFollowUp) {
        const offTopic = meshyOffTopicMessage(true);
        if (turnId !== voiceTurnGenerationRef.current) return;
        setVoiceResponse(offTopic);
        setVoicePhase("responding");
        setVoiceTurns((prev) => [
          ...prev,
          {
            user: normalized,
            userNote:
              corrections.length > 0
                ? `Heard: "${transcript.trim()}" · ${corrections.join(", ")}`
                : transcript.trim() !== normalized
                  ? `Heard: "${transcript.trim()}"`
                  : undefined,
            assistant: meshyOffTopicMessage(false),
          },
        ]);
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: meshyOffTopicMessage(false),
          },
        ]);
        await speakText(offTopic, turnId);
        return;
      }

      if (isKubernetesRelated(normalized, { voiceMode: true }) && !isShortFollowUp) {
        const voiceHistoryForAck = voiceTurns.flatMap((turn) => [
          { role: "user" as const, content: turn.user },
          {
            role: "assistant" as const,
            content: turn.assistantContext ?? turn.assistant,
          },
        ]);
        setVoicePhase("responding");
        await speakText(
          voiceWorkingAck(normalized, {
            turnIndex: voiceTurns.length,
            history: voiceHistoryForAck,
          }),
          turnId,
        );
        if (turnId !== voiceTurnGenerationRef.current) return;
        setVoicePhase("processing");
      }

      const voiceHistory = voiceTurns.flatMap((turn) => [
        { role: "user" as const, content: turn.user },
        {
          role: "assistant" as const,
          content: turn.assistantContext ?? turn.assistant,
        },
      ]);
      const historyPayload = [
        ...voiceHistory,
        { role: "user" as const, content: normalized },
      ];

      const conversation = resolveMeshyConversationTurn(
        normalized,
        voiceHistory,
        true,
      );
      const apiMessage =
        conversation.kind === "continue"
          ? normalizeKubernetesInput(conversation.message).normalized
          : normalized;

      const response = await fetch(`${API_BASE}/api/copilot/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: abortController.signal,
        body: JSON.stringify({
          clusterId: activeClusterId,
          message: apiMessage,
          rawMessage: transcript.trim(),
          voiceMode: true,
          history: historyPayload,
        }),
      });

      if (turnId !== voiceTurnGenerationRef.current) return;

      if (!response.ok) {
        let errMsg = "Failed to contact Meshy";
        try {
          const errData = await response.json();
          if (errData?.error) errMsg = errData.error;
        } catch {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      if (turnId !== voiceTurnGenerationRef.current) return;
      const voiceChatText =
        (typeof data.voiceChatMessage === "string" && data.voiceChatMessage.trim()) ||
        (data.message && String(data.message).trim()) ||
        "";
      const assistantText = voiceChatText || "Done.";
      let voiceScript: string[] =
        Array.isArray(data.voiceScript) && data.voiceScript.length > 0
          ? data.voiceScript
          : [assistantText];
      const isSpellNamesRequest = /^spell (nodes|pods|deployments|services|namespaces|nodepools|nodeclaims) names$/i.test(
        apiMessage,
      );
      if (!isSpellNamesRequest) {
        voiceScript = ensureVoiceListSpellOffer(apiMessage, historyPayload, voiceScript);
      }
      voiceScript = splitListOfferVoiceScript(voiceScript);
      const voiceHistoryText = voiceScript.join(" ");
      const voiceDisplayText = voiceChatText || voiceHistoryText;

      setVoiceTurns((prev) => [
        ...prev,
        {
          user: normalized,
          userNote:
            corrections.length > 0
              ? `Heard: "${transcript.trim()}" · ${corrections.join(", ")}`
              : transcript.trim() !== normalized
                ? `Heard: "${transcript.trim()}"`
                : undefined,
          assistant: voiceDisplayText,
          assistantContext: voiceHistoryText,
          uiCard: data.uiCard ?? undefined,
        },
      ]);

      // Add to main chat
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: assistantText,
          uiCard: data.uiCard ?? undefined,
        },
      ]);

      // Show response in voice modal
      setVoiceResponse(voiceDisplayText);
      setVoiceProcessing(false);

      await speakVoiceLines(voiceScript, turnId);
    } catch (error: any) {
      if (error?.name === "AbortError") return;
      if (turnId !== voiceTurnGenerationRef.current) return;

      const errText = error.message || "Failed to retrieve response from Meshy.";
      setVoiceResponse(`⚠️ Error: ${errText}`);
      setVoicePhase("responding");

      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `⚠️ **Error:** ${errText}`,
        },
      ]);
    } finally {
      voiceFetchAbortRef.current = null;
      if (turnId !== voiceTurnGenerationRef.current) return;
      setVoiceProcessing(false);
      voiceSubmittingRef.current = false;
      resumeListening();
    }
  };

  // Keep the ref always pointing to the latest version of handleVoiceAutoSubmit
  // This avoids the stale closure from the useEffect([]) speech recognition setup
  useEffect(() => {
    voiceAutoSubmitRef.current = handleVoiceAutoSubmit;
  });

  /** Stop Meshy speech or in-flight request and listen for the next question. */
  const handleVoiceStop = () => {
    beginVoiceTurn();
    voiceSubmittingRef.current = false;
    setVoiceProcessing(false);
    resumeListening();
  };

  /** Tap mic while listening to start a fresh capture. */
  const handleVoiceMicPress = () => {
    if (voicePhase === "responding" || voicePhase === "processing") {
      handleVoiceStop();
      return;
    }
    beginVoiceTurn();
    resumeListening();
  };

  const meshyVoiceBusy =
    voiceProcessing ||
    voicePhase === "processing" ||
    voicePhase === "responding";

  const sendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || !activeClusterId || !token || loading) return;

    const { normalized, corrections } = prepareUserInput(textToSend);

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: normalized,
      inputNote:
        corrections.length > 0
          ? `Interpreted: ${corrections.join(", ")}`
          : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

      if (!isKubernetesRelated(normalized, { voiceMode: true })) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: meshyOffTopicMessage(false),
        },
      ]);
      setLoading(false);
      return;
    }

    const historyPayload = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await fetch(`${API_BASE}/api/copilot/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clusterId: activeClusterId,
          message: normalized,
          history: historyPayload,
        }),
      });

      if (!response.ok) {
        let errMsg = "Failed to contact Meshy";
        try {
          const errData = await response.json();
          if (errData?.error) {
            errMsg = errData.error;
          }
        } catch {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.message,
          uiCard: data.uiCard ?? undefined,
        },
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `⚠️ **Error:** ${error.message || "Failed to retrieve response from Meshy."}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveHealAction = async (healId: string, podName: string) => {
    if (!token || actionLoading[healId]) return;
    setActionLoading((prev) => ({ ...prev, [healId]: true }));
    try {
      await approveHeal(healId, token);
      setActionDone((prev) => ({ ...prev, [healId]: true }));
      setMessages((prev) => [
        ...prev,
        {
          id: `approve-success-${Date.now()}`,
          role: "assistant",
          content: `✅ Remediation for pod **${podName}** has been approved and successfully initiated! You can view its live progress in the **Heal log** page.`,
        },
      ]);
    } catch (err: any) {
      alert(`Failed to approve heal: ${err.message || err}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [healId]: false }));
    }
  };

  const handleQuickSuggestion = (text: string) => {
    sendMessage(text);
  };

  const canClearChat = useMemo(
    () => messages.some((message) => message.id !== "welcome"),
    [messages],
  );

  const handleClearChat = () => {
    if (!canClearChat || loading) return;
    setShowClearConfirm(true);
  };

  const confirmClearChat = () => {
    if (activeClusterId) {
      clearMeshyChatMessages(activeClusterId);
    }
    setMessages([MESHY_WELCOME_MESSAGE]);
    setShowClearConfirm(false);
  };

  const SUGGESTIONS = [
    { text: "🔍 Scan cluster for issues", label: "Scan Cluster" },
    { text: "📋 Show all cluster pods", label: "List Pods" },
    { text: "⚡ Diagnose unhealthy pods", label: "Diagnose Unhealthy" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
        {!activeClusterId ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground animate-pulse" />
            <h3 className="mt-4 text-lg font-semibold">No Cluster Selected</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
              Please choose a Kubernetes cluster in the sidebar dropdown to start chatting with Meshy.
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-lg">
            {/* Chat Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-border/80 bg-muted/40 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-400">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold leading-tight">Meshy</h2>
                    {canClearChat && (
                      <button
                        type="button"
                        onClick={handleClearChat}
                        disabled={loading}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        title="Clear chat history"
                      >
                        <Trash2 className="h-3 w-3" />
                        Clear chat
                      </button>
                    )}
                  </div>
                  <p className="text-2xs text-emerald-500 font-medium flex items-center gap-1 mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                    MeshyAI assistant connected
                  </p>
                </div>
              </div>

              {/* Active LLM Provider info & Voice Controls */}
              <div className="flex items-center gap-3">
                {/* Voice Interaction Button */}
                <button
                  type="button"
                  onClick={startVoiceAssistant}
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold border bg-muted/60 hover:bg-muted text-muted-foreground border-border transition-all duration-300 relative overflow-hidden group"
                  title="Start Voice Assistant"
                >
                  <AnimatedVoiceAssistantIcon
                    size={20}
                    active
                    className="group-hover:scale-110 transition-transform"
                  />
                  <span>Voice Ask</span>
                </button>

                {llmConfig && (
                  <div className="flex items-center gap-2 text-2xs bg-violet-600/10 dark:bg-violet-400/10 text-violet-600 dark:text-violet-400 px-2.5 py-1 rounded-full border border-violet-600/20 dark:border-violet-400/20">
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span className="font-semibold capitalize">
                      {llmConfig.activeChain && llmConfig.activeChain.length > 0 ? (
                        <>
                          {llmConfig.activeChain[0] === "ollama" && `Ollama: ${llmConfig.ollamaModel}`}
                          {llmConfig.activeChain[0] === "openai" && `OpenAI: ${llmConfig.openaiModel}`}
                          {llmConfig.activeChain[0] === "puter" && `Puter: ${llmConfig.puterModel}`}
                        </>
                      ) : (
                        "Local Heuristic Mode"
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Message Area */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-thin scrollbar-thumb-muted">
              {messages.map((m) => {
                const isAssistant = m.role === "assistant";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex w-full items-start gap-4 transition-all duration-300",
                      isAssistant ? "justify-start" : "justify-end",
                    )}
                  >
                    {isAssistant && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-md">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    )}

                    <div className="flex flex-col gap-2.5 max-w-[85%] sm:max-w-[75%]">
                      {/* Text Bubble */}
                      <div
                        className={cn(
                          "rounded-2xl px-4 py-3 shadow-sm transition-all",
                          isAssistant
                            ? "bg-muted/80 text-foreground border border-border/40 rounded-tl-none"
                            : "bg-primary text-primary-foreground rounded-tr-none",
                        )}
                      >
                        <MeshyMessageContent
                          content={m.content}
                          variant={isAssistant ? "assistant" : "user"}
                        />
                        {m.inputNote && (
                          <p className="mt-2 text-2xs italic opacity-75">
                            {m.inputNote}
                          </p>
                        )}
                      </div>

                      {/* Render UI Cards if present */}
                      {m.uiCard && (
                        <div className="mt-1 transition-all duration-300 animate-in fade-in slide-in-from-bottom-3">
                          {m.uiCard.type === "pod-list" && (
                            <PodListCard
                              pods={m.uiCard.data.pods}
                              onDiagnose={(podName, ns) => handleQuickSuggestion(`Diagnose pod ${podName} in namespace ${ns}`)}
                              onRestart={(podName, ns) => handleQuickSuggestion(`Restart pod ${podName} in namespace ${ns}`)}
                            />
                          )}
                          {m.uiCard.type === "diagnosis" && (
                            <DiagnosisCard
                              data={m.uiCard.data}
                              loading={actionLoading[m.uiCard.data.healRecordId]}
                              done={actionDone[m.uiCard.data.healRecordId]}
                              onApprove={() => handleApproveHealAction(m.uiCard!.data.healRecordId, m.uiCard!.data.podName)}
                            />
                          )}
                          {m.uiCard.type === "action-result" && (
                            <ActionResultCard data={m.uiCard.data} />
                          )}
                          {m.uiCard.type === "heal-trigger" && (
                            <HealTriggerCard data={m.uiCard.data} />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex w-full items-start gap-4 justify-start">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white animate-spin">
                    <Loader2 className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl bg-muted/80 px-4 py-3 text-sm border border-border/40 rounded-tl-none flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-violet-600 dark:text-violet-400" />
                    <span className="text-muted-foreground font-medium">Meshy is thinking…</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Footer */}
            <div className="shrink-0 border-t border-border/80 bg-muted/20 px-6 py-4 space-y-3">
              {/* Suggestion Chips */}
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={loading}
                    onClick={() => handleQuickSuggestion(s.text)}
                    className="rounded-full border border-border bg-card px-3 py-1 text-2xs font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-200"
                  >
                    {s.label}
                  </button>
                ))}
              </div>

             {/* Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage(input);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={input}
                  disabled={loading}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about pods, nodes, helm, ingress, CI/CD, monitoring, nodepools…"
                  className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-violet-500/80 focus:ring-1 focus:ring-violet-500/80 transition-all duration-200"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear chat?"
        description="Message history for this cluster will be removed. This cannot be undone."
        confirmLabel="Clear chat"
        variant="destructive"
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={confirmClearChat}
      />

      {/* Fullscreen Meshy Voice */}
      {showVoiceModal && (
        <div className="fixed inset-0 z-50 isolate flex flex-col bg-gradient-to-b from-background via-violet-50 to-muted text-foreground dark:from-neutral-950 dark:via-neutral-900 dark:to-black animate-in fade-in duration-300">
          {/* Top Gradient Bar */}
          <div className="pointer-events-none absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-400 opacity-60" />

          {/* Close — Top Left */}
          <button
            type="button"
            onClick={closeVoiceAssistant}
            className="absolute top-5 left-5 z-[100] flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-red-300/50 bg-red-50 text-red-600 shadow-lg transition-all duration-200 hover:scale-110 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-600/20 dark:text-red-400 dark:hover:bg-red-600/40 dark:hover:text-red-300"
            title="Close Voice Assistant"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Header — mic + status */}
          <div className="relative z-10 shrink-0 flex flex-col items-center px-6 pt-14 pb-4 pointer-events-none">
            <div className="relative flex h-36 w-36 items-center justify-center mb-3 pointer-events-none">
              <div
                className="absolute inset-0 rounded-full border border-violet-500/10 animate-ping pointer-events-none"
                style={{ animationDuration: "3s" }}
              />
              <div
                className="absolute inset-4 rounded-full border border-fuchsia-500/20 animate-ping pointer-events-none"
                style={{ animationDuration: "2s" }}
              />
              <div
                className="absolute inset-8 rounded-full border border-cyan-400/15 animate-ping pointer-events-none"
                style={{ animationDuration: "2.5s" }}
              />

              <div
                className={cn(
                  "absolute h-24 w-24 rounded-full bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-cyan-400 blur-xl transition-all duration-500 pointer-events-none",
                  voicePhase === "speaking"
                    ? "scale-125 opacity-55 animate-pulse"
                    : voicePhase === "processing"
                      ? "scale-110 opacity-40 animate-spin"
                      : voicePhase === "responding"
                        ? "scale-100 opacity-50"
                        : "scale-100 opacity-30",
                )}
              />

              <button
                type="button"
                onClick={handleVoiceMicPress}
                className={cn(
                  "pointer-events-auto relative z-10 flex h-20 w-20 items-center justify-center rounded-full border shadow-2xl transition-all duration-300 disabled:opacity-50",
                  meshyVoiceBusy
                    ? "border-red-500/40 bg-red-600/20 text-red-500 scale-110 shadow-[0_0_30px_rgba(239,68,68,0.35)] dark:text-red-400"
                    : voicePhase === "speaking"
                      ? "border-red-500/40 bg-red-600/20 text-red-500 scale-110 shadow-[0_0_30px_rgba(239,68,68,0.35)] dark:text-red-400"
                      : "border-violet-500/40 bg-violet-600/10 text-violet-600 hover:bg-violet-600/20 hover:scale-105 dark:text-violet-400",
                )}
                title={
                  meshyVoiceBusy
                    ? "Stop Meshy and ask your next question"
                    : "Tap to reset listening"
                }
              >
                {voicePhase === "processing" ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : meshyVoiceBusy ? (
                  <Square className="h-7 w-7 fill-current" />
                ) : (
                  <AnimatedVoiceAssistantIcon
                    size={56}
                    active
                    listening={voicePhase === "speaking"}
                  />
                )}
              </button>
            </div>

            {meshyVoiceBusy && (
              <button
                type="button"
                onClick={handleVoiceStop}
                className="relative z-30 mb-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-red-300/50 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 pointer-events-auto dark:border-red-500/40 dark:bg-red-600/15 dark:text-red-300 dark:hover:bg-red-600/25"
              >
                <Square className="h-4 w-4 fill-current" />
                Stop
              </button>
            )}

            <div className="mb-3 flex h-1.5 w-48 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-75"
                style={{ width: `${Math.round(micLevel * 100)}%` }}
              />
            </div>

            <h3 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-600 dark:from-violet-400 dark:via-fuchsia-400 dark:to-cyan-400 mb-1">
              Meshy Voice
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed text-center max-w-lg">
              {voicePhase === "monitoring" &&
                "Speak clearly — words appear left to right as you talk. I send after you pause for 3 seconds."}
              {voicePhase === "speaking" &&
                "Listening… keep going. Pause for 3 seconds when you're done."}
              {voicePhase === "processing" &&
                "Thinking… tap Stop to interrupt and ask something else."}
              {voicePhase === "responding" &&
                "Speaking… tap Stop when you want to ask your next question."}
            </p>
          </div>

          {/* Scrollable conversation body — older turns scroll up, latest at bottom */}
          <div className="flex-1 min-h-0 w-full overflow-y-auto">
            <div className="min-h-full flex flex-col justify-end gap-4 max-w-4xl mx-auto px-6 pb-6">
              {voiceTurns.length > 0 && (
                <div className="w-full space-y-3">
                  {voiceTurns.map((turn, index) => (
                    <div key={`voice-turn-${index}`} className="space-y-2">
                      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <AnimatedVoiceAssistantIcon size={14} active listening />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                            You
                          </span>
                        </div>
                        <p className="text-sm text-foreground">&ldquo;{turn.user}&rdquo;</p>
                        {turn.userNote && (
                          <p className="mt-1 text-[11px] text-muted-foreground">{turn.userNote}</p>
                        )}
                      </div>
                      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm dark:bg-gradient-to-br dark:from-violet-600/10 dark:via-transparent dark:to-cyan-500/10">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600 text-white">
                            <Sparkles className="h-3 w-3" />
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                            Meshy
                          </span>
                        </div>
                        <MeshyMessageContent
                          content={turn.assistant}
                          variant="assistant"
                          className="text-sm text-foreground [&_strong]:text-violet-700 dark:[&_strong]:text-violet-200 [&_code]:text-emerald-700 dark:[&_code]:text-emerald-200"
                        />
                        {turn.uiCard && (
                          <div className="mt-3 transition-all duration-300 animate-in fade-in slide-in-from-bottom-3">
                            {turn.uiCard.type === "pod-list" && (
                              <PodListCard
                                pods={turn.uiCard.data.pods}
                                onDiagnose={(podName, ns) =>
                                  handleQuickSuggestion(
                                    `Diagnose pod ${podName} in namespace ${ns}`,
                                  )
                                }
                                onRestart={(podName, ns) =>
                                  handleQuickSuggestion(
                                    `Restart pod ${podName} in namespace ${ns}`,
                                  )
                                }
                              />
                            )}
                            {turn.uiCard.type === "diagnosis" && (
                              <DiagnosisCard
                                data={turn.uiCard.data}
                                loading={actionLoading[turn.uiCard.data.healRecordId]}
                                done={actionDone[turn.uiCard.data.healRecordId]}
                                onApprove={() =>
                                  handleApproveHealAction(
                                    turn.uiCard!.data.healRecordId,
                                    turn.uiCard!.data.podName,
                                  )
                                }
                              />
                            )}
                            {turn.uiCard.type === "action-result" && (
                              <ActionResultCard data={turn.uiCard.data} />
                            )}
                            {turn.uiCard.type === "heal-trigger" && (
                              <HealTriggerCard data={turn.uiCard.data} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(voiceTranscriptFinal || voiceTranscriptInterim) && liveVoiceDisplay && (
                <div className="w-full rounded-2xl border border-border bg-card p-4 shadow-sm transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center gap-2 mb-1.5">
                    <AnimatedVoiceAssistantIcon size={16} active listening />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                      Your Request
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground leading-relaxed">
                    &ldquo;{liveVoiceDisplay.normalized}&rdquo;
                  </p>
                  {liveVoiceDisplay.raw !== liveVoiceDisplay.normalized && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Heard: &ldquo;{liveVoiceDisplay.raw}&rdquo;
                    </p>
                  )}
                  {liveVoiceDisplay.corrections.length > 0 && (
                    <p className="mt-1 text-[11px] text-cyan-700 dark:text-cyan-300/80">
                      Interpreted: {liveVoiceDisplay.corrections.join(", ")}
                    </p>
                  )}
                </div>
              )}

              {voiceProcessing && (
                <div className="w-full flex items-center justify-center gap-3 py-4 animate-in fade-in duration-300">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="h-2.5 w-2.5 rounded-full bg-fuchsia-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">Meshy is thinking...</span>
                </div>
              )}

              {voiceResponse && voiceTurns.length === 0 && !voiceProcessing && (
                <div className="w-full rounded-2xl border border-border bg-card p-5 shadow-sm transition-all animate-in fade-in slide-in-from-bottom-3 duration-500 dark:bg-gradient-to-br dark:from-violet-600/10 dark:via-transparent dark:to-cyan-500/10">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                      Meshy Response
                    </span>
                  </div>
                  <MeshyMessageContent
                    content={voiceResponse}
                    variant="assistant"
                    className="text-foreground [&_strong]:text-violet-700 dark:[&_strong]:text-violet-200 [&_code]:text-emerald-700 dark:[&_code]:text-emerald-200"
                  />
                </div>
              )}

              <div ref={voiceScrollEndRef} aria-hidden className="h-px shrink-0" />
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 px-6 py-4 text-center border-t border-border">
            <p className="text-[11px] text-muted-foreground">
              Press <span className="text-red-600 font-semibold dark:text-red-400">✕</span> to close
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// Custom UI Card Renderers
// ---------------------------------------------------------

function podRowKey(namespace: string, name: string): string {
  return `${namespace}/${name}`;
}

function PodListCard({
  pods,
  onDiagnose,
  onRestart,
}: {
  pods: any[];
  onDiagnose: (name: string, ns: string) => void;
  onRestart: (name: string, ns: string) => void;
}) {
  const uniquePods = pods.filter((pod, index, all) => {
    const key = podRowKey(pod.namespace, pod.name);
    return all.findIndex((p) => podRowKey(p.namespace, p.name) === key) === index;
  });
  const troubled = uniquePods.filter((p) => p.issueType || !p.ready);
  const items = troubled.length > 0 ? troubled : uniquePods.slice(0, 5);

  return (
    <div className="rounded-xl border border-border bg-card/65 p-4 shadow-md max-w-lg">
      <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-3">
        <Box className="h-4 w-4 text-violet-500" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {troubled.length > 0 ? "Troubled Pods Found" : "Recent Active Pods"}
        </h4>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No pods found in cluster.</p>
        ) : (
          items.map((pod) => {
            const isUnhealthy = pod.issueType || !pod.ready;
            return (
              <div
                key={podRowKey(pod.namespace, pod.name)}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border p-2.5 transition-all text-xs",
                  isUnhealthy
                    ? "border-red-100 bg-red-50/20 dark:border-red-950/20 dark:bg-red-950/5"
                    : "border-border bg-muted/30",
                )}
              >
                <div className="min-w-0">
                  <div className="font-semibold truncate text-foreground">{pod.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                    Namespace: <span className="font-mono">{pod.namespace}</span>
                  </div>
                  {pod.issueType && (
                    <span className="inline-block mt-1 rounded bg-red-100 dark:bg-red-900/35 text-red-700 dark:text-red-300 px-1 py-0.5 text-[9px] font-bold uppercase">
                      ⚠️ {pod.issueType}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onDiagnose(pod.name, pod.namespace)}
                    className="rounded bg-violet-600 hover:bg-violet-700 text-white font-semibold px-2 py-1 text-[10px] shadow transition-all"
                  >
                    Diagnose
                  </button>
                  <button
                    type="button"
                    onClick={() => onRestart(pod.name, pod.namespace)}
                    className="rounded border border-border bg-card hover:bg-accent text-muted-foreground hover:text-accent-foreground px-2 py-1 text-[10px] transition-all"
                  >
                    Restart
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function DiagnosisCard({
  data,
  loading,
  done,
  onApprove,
}: {
  data: any;
  loading: boolean;
  done: boolean;
  onApprove: () => void;
}) {
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card/65 p-4 shadow-md max-w-lg space-y-3.5">
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            SRE Diagnostic Report
          </h4>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
            data.severity === "critical"
              ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
              : data.severity === "high"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
          )}
        >
          {data.severity}
        </span>
      </div>

      <div className="space-y-1">
        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide">
          Root Cause
        </div>
        <div className="text-sm font-semibold text-foreground">{data.rootCause}</div>
      </div>

      <div className="space-y-1">
        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide">
          Proposed Remediation Action
        </div>
        <div className="text-xs font-mono font-bold bg-muted/50 text-violet-600 dark:text-violet-400 rounded px-2 py-1 inline-block border">
          {data.action}
        </div>
      </div>

      {data.patchSpec && (
        <div className="space-y-1">
          <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wide">
            Strategic Merge Patch
          </div>
          <pre className="text-[10px] font-mono bg-muted p-2 rounded max-h-24 overflow-y-auto border text-foreground/80 leading-relaxed">
            {JSON.stringify(data.patchSpec, null, 2)}
          </pre>
        </div>
      )}

      {/* Accordion for reasoning */}
      <div className="border border-border/60 rounded-lg overflow-hidden bg-muted/20">
        <button
          type="button"
          onClick={() => setShowReasoning(!showReasoning)}
          className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold text-muted-foreground hover:bg-accent/40 transition-all"
        >
          <span>Step-by-Step Reasoning</span>
          <span className="text-[10px]">{showReasoning ? "▲ Hide" : "▼ Show"}</span>
        </button>
        {showReasoning && (
          <div className="px-3 py-2.5 text-xs text-foreground/80 leading-relaxed border-t border-border/50 bg-card whitespace-pre-wrap">
            {data.reasoning}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-1">
        {done ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-1.5 text-xs font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            Remediation Triggered
          </div>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={onApprove}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold px-4 py-2 text-xs shadow-md transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Triggering...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Approve & Execute Remediation
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function ActionResultCard({ data }: { data: any }) {
  return (
    <div className="rounded-xl border border-border bg-card/65 p-4 shadow-md max-w-lg flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <h4 className="text-xs font-bold text-foreground">Action Completed</h4>
        <p className="text-xs text-muted-foreground">{data.message}</p>
        <div className="flex flex-wrap gap-2.5 pt-1.5 text-[10px] text-muted-foreground font-mono">
          <span>Namespace: {data.namespace}</span>
          <span>•</span>
          <span>Target: {data.name}</span>
        </div>
      </div>
    </div>
  );
}

function HealTriggerCard({ data }: { data: any }) {
  return (
    <div className="rounded-xl border border-border bg-card/65 p-4 shadow-md max-w-lg flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-500">
        <Sliders className="h-5 w-5 animate-pulse" />
      </div>
      <div className="space-y-1.5">
        <h4 className="text-xs font-bold text-foreground">Self-Healing Pipeline Triggered</h4>
        <p className="text-xs text-muted-foreground">
          The agent has initiated the self-healing workflow for pod <span className="font-semibold text-foreground">{data.podName}</span> in namespace <span className="font-mono bg-muted/60 px-1 py-0.5 rounded text-2xs text-foreground/90">{data.namespace}</span>. You can monitor the diagnostic execution logs in real-time.
        </p>
        <Link
          href="/dashboard/heals"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline pt-1"
        >
          Open Heal Logs
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
