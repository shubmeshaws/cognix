"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Mic,
  MicOff,
  Volume2,
  XCircle,
  AlertTriangle,
  Play,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { useMeshy } from "@/stores/meshy";
import { useClusterStore } from "@/stores/cluster";
import { cn } from "@/lib/utils";
import { Topbar } from "@/components/dashboard/Topbar";

async function speakWithHuggingFace(text: string, token: string): Promise<boolean> {
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, token }),
    });
    if (!response.ok) {
      console.warn("Hugging Face API returned non-200, falling back to local TTS");
      return false;
    }
    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    await audio.play();
    return true;
  } catch (error) {
    console.error("Hugging Face TTS fetch failed:", error);
    return false;
  }
}

const STATUS_ICON = {
  healed: CheckCircle2,
  failed: XCircle,
  escalated: AlertTriangle,
};
const STATUS_CLASS = {
  healed: "text-emerald-500",
  failed: "text-red-500",
  escalated: "text-amber-500",
};

export default function MeshyPage() {
  const {
    enabled,
    toggle,
    hfToken,
    setHfToken,
    useHuggingFace,
    setUseHuggingFace,
    speakOnIssueOccurs,
    setSpeakOnIssueOccurs,
    speakOnIssueResolved,
    setSpeakOnIssueResolved,
  } = useMeshy();
  const heals = useClusterStore((s) => s.heals);
  const [isPlayingTest, setIsPlayingTest] = useState(false);

  const announcedHeals = heals.filter(
    (h) =>
      h.status === "healed" ||
      h.status === "failed" ||
      h.status === "escalated",
  );
  
  const alerts = useClusterStore((s) => s.alerts);

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar title="MeshyAI" />

      <div className="flex-1 space-y-6 p-6">
        {/* Hero card */}
        <div
          className={cn(
            "relative overflow-hidden rounded-xl border p-6 transition-all",
            enabled
              ? "border-violet-400/50 bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50 shadow-md dark:from-violet-950/30 dark:via-purple-950/20 dark:to-fuchsia-950/20"
              : "bg-card",
          )}
        >
          {enabled && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {[...Array(3)].map((_, i) => (
                <span
                  key={i}
                  className="absolute left-6 top-6 h-20 w-20 rounded-full border border-violet-400/30 animate-ping"
                  style={{ animationDelay: `${i * 0.4}s`, animationDuration: "2s" }}
                />
              ))}
            </div>
          )}

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all",
                  enabled
                    ? "border-violet-400 bg-violet-100 dark:bg-violet-900/40"
                    : "border-border bg-muted",
                )}
              >
                {enabled ? (
                  <Mic className="h-7 w-7 text-violet-600 dark:text-violet-400" />
                ) : (
                  <MicOff className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">MeshyAI</h2>
                <p className="text-sm text-muted-foreground">AI Text-to-Speech Healing Agent</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Announces pod healing events aloud using standard or premium AI voice synthesis
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={toggle}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-all",
                  enabled
                    ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-700 dark:hover:bg-violet-600"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {enabled ? (
                  <>
                    <Volume2 className="h-4 w-4 animate-pulse" />
                    Enabled
                  </>
                ) : (
                  <>
                    <MicOff className="h-4 w-4" />
                    Disabled
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (typeof window === "undefined") return;
                  setIsPlayingTest(true);
                  const testPhrase = "Meshy AI Alert. Pod, microservices-auth-7bfb-8-c, in namespace, development, has been healed successfully. The detected issue was: OOMKilled.";

                  let spoke = false;
                  if (useHuggingFace && hfToken) {
                    spoke = await speakWithHuggingFace(testPhrase, hfToken);
                  }

                  if (!spoke) {
                    const synth = window.speechSynthesis;
                    if (!synth) {
                      alert("Text-to-Speech is not supported in this browser.");
                      setIsPlayingTest(false);
                      return;
                    }
                    synth.cancel();
                    const utterance = new SpeechSynthesisUtterance(testPhrase);

                    // Attempt to find a high-quality natural/premium English voice
                    const voices = synth.getVoices();
                    const bestVoice = voices.find(v => v.lang.startsWith("en") && v.name.includes("Google")) ||
                                      voices.find(v => v.lang.startsWith("en") && v.name.includes("Natural")) ||
                                      voices.find(v => v.lang.startsWith("en") && v.name.includes("Premium")) ||
                                      voices.find(v => v.lang.startsWith("en") && v.name.includes("Samantha")) ||
                                      voices.find(v => v.lang.startsWith("en") && v.name.includes("Daniel")) ||
                                      voices.find(v => v.lang.startsWith("en") && v.name.includes("US")) ||
                                      voices.find(v => v.lang.startsWith("en"));
                    
                    if (bestVoice) {
                      utterance.voice = bestVoice;
                    }

                    utterance.rate = 0.88; // Slightly slower for warm, human delivery
                    utterance.pitch = 1.0;  // Standard warm pitch
                    utterance.volume = 1;
                    utterance.onend = () => setIsPlayingTest(false);
                    utterance.onerror = () => setIsPlayingTest(false);
                    synth.speak(utterance);
                  } else {
                    setIsPlayingTest(false);
                  }
                }}
                disabled={isPlayingTest}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-all",
                  isPlayingTest
                    ? "border-violet-300 bg-violet-100 text-violet-500 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-400"
                    : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/30"
                )}
              >
                <Play className={cn("h-4 w-4", isPlayingTest && "animate-spin")} />
                {isPlayingTest ? "Speaking..." : "Test Voice"}
              </button>
            </div>
          </div>

          {enabled && (
            <div className="relative mt-4 rounded-lg border border-violet-200/60 bg-white/60 px-4 py-3 dark:border-violet-800/40 dark:bg-violet-950/20">
              <p className="text-xs text-violet-700 dark:text-violet-300">
                🎙️ MeshyAI is listening for heal events. It will speak aloud whenever a pod is
                healed, fails to heal, or is escalated to on-call.
              </p>
            </div>
          )}
        </div>

        {/* Hugging Face Settings Card */}
        <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold">Premium Hugging Face AI Voice</h3>
                <p className="text-2xs text-muted-foreground">
                  Get ultra-realistic, natural voice synthesis using cloud-hosted Meta MMS models
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Use AI Voice</span>
              <button
                type="button"
                role="switch"
                aria-checked={useHuggingFace}
                onClick={() => setUseHuggingFace(!useHuggingFace)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  useHuggingFace ? "bg-violet-600" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    useHuggingFace ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>

          {useHuggingFace && (
            <div className="space-y-3 pt-2 border-t border-dashed">
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-foreground flex items-center justify-between">
                  <span>Hugging Face Access Token</span>
                  <a
                    href="https://huggingface.co/settings/tokens"
                    target="_blank"
                    rel="noreferrer"
                    className="text-2xs text-violet-600 hover:underline flex items-center gap-0.5"
                  >
                    Get free token <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
                
                <input
                  type="password"
                  placeholder="hf_..."
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                />

                <div className="flex items-center justify-between pt-1">
                  <p className="text-2xs text-muted-foreground">
                    Token is stored locally in your browser&apos;s LocalStorage.
                  </p>
                  {hfToken ? (
                    <span className="text-2xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 animate-pulse">
                      ✓ Auto-saved & Ready!
                    </span>
                  ) : (
                    <span className="text-2xs text-amber-600 dark:text-amber-400 font-medium">
                      ⚠️ Paste token to activate
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Event Announcements Card */}
        <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold">Event Announcements</h3>
          <div className="space-y-4 pt-2 border-t border-dashed">
            
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">Speak when issue occurs</span>
                <p className="text-2xs text-muted-foreground">Announce new alerts when they are detected</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={speakOnIssueOccurs}
                onClick={() => setSpeakOnIssueOccurs(!speakOnIssueOccurs)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  speakOnIssueOccurs ? "bg-violet-600" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    speakOnIssueOccurs ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">Speak when issue is resolved</span>
                <p className="text-2xs text-muted-foreground">Announce when a heal succeeds, fails, or escalates</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={speakOnIssueResolved}
                onClick={() => setSpeakOnIssueResolved(!speakOnIssueResolved)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  speakOnIssueResolved ? "bg-violet-600" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    speakOnIssueResolved ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

          </div>
        </div>

        {/* What MeshyAI announces */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">What MeshyAI announces</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              { icon: CheckCircle2, cls: "text-emerald-500", label: "Heal completed", desc: "Pod healed successfully for a rule-enabled issue type" },
              { icon: XCircle, cls: "text-red-500", label: "Heal failed", desc: "The healing action could not be completed" },
              { icon: AlertTriangle, cls: "text-amber-500", label: "Escalated", desc: "Issue escalated to on-call team after heal failure" },
            ].map(({ icon: Icon, cls, label, desc }) => (
              <li key={label} className="flex items-start gap-3">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cls)} />
                <div>
                  <span className="font-medium text-foreground">{label}</span>
                  <span className="ml-1 text-xs">— {desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Recent announced events */}
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">
              Recent events ({announcedHeals.length + alerts.length})
            </h3>
          </div>
          {announcedHeals.length === 0 && alerts.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Mic className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                No events yet — they will appear here as they occur
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {[...alerts, ...announcedHeals]
                .sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime(),
                )
                .map((event) => {
                  const isAlert = 'message' in event;
                  
                  if (isAlert) {
                    const a = event as typeof alerts[0];
                    return (
                      <li
                        key={a.id}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {a.podName}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">
                              · ns: {a.namespace}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Alert — {a.message}
                          </p>
                        </div>
                        <time className="shrink-0 text-2xs text-muted-foreground">
                          {new Date(a.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </li>
                    );
                  }
                  
                  const h = event as typeof announcedHeals[0];
                  const Icon =
                    STATUS_ICON[h.status as keyof typeof STATUS_ICON] ??
                    CheckCircle2;
                  const cls =
                    STATUS_CLASS[h.status as keyof typeof STATUS_CLASS] ??
                    "text-muted-foreground";
                  return (
                    <li
                      key={h.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20"
                    >
                      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cls)} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {h.podName}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            · ns: {h.namespace}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {h.issueType} — {h.actionTaken} — {h.status}
                        </p>
                      </div>
                      <time className="shrink-0 text-2xs text-muted-foreground">
                        {new Date(h.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
