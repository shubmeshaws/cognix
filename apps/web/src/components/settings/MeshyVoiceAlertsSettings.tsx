"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
  Mic,
  MicOff,
  Play,
  Sparkles,
  Volume2,
} from "lucide-react";

import { SettingsSection } from "@/components/settings/SettingsSection";
import { ensureSupertonicVoice, speakMeshyText } from "@/lib/meshy-tts";
import {
  MESHY_VOICE_LANGUAGES,
  meshyVoiceTestPhrase,
  type MeshyVoiceLanguage,
} from "@/lib/meshy-voice-language";
import { useMeshy } from "@/stores/meshy";
import { cn } from "@/lib/utils";

function ToggleSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-60",
        checked ? "bg-violet-600" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}

export function MeshyVoiceAlertsSettings() {
  const {
    enabled,
    toggle,
    hfToken,
    setHfToken,
    useHuggingFace,
    setUseHuggingFace,
    voiceGender,
    setVoiceGender,
    voiceLanguage,
    setVoiceLanguage,
    speakOnIssueOccurs,
    setSpeakOnIssueOccurs,
    speakOnIssueResolved,
    setSpeakOnIssueResolved,
  } = useMeshy();

  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [supertonicStarting, setSupertonicStarting] = useState(false);
  const [supertonicStatus, setSupertonicStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!useHuggingFace) return;
    let cancelled = false;
    setSupertonicStarting(true);
    void ensureSupertonicVoice().then((result) => {
      if (cancelled) return;
      setSupertonicStarting(false);
      setSupertonicStatus(result.ok ? "Supertonic ready" : result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [useHuggingFace]);

  const handleNeuralVoiceToggle = async () => {
    if (useHuggingFace) {
      setUseHuggingFace(false);
      setSupertonicStatus(null);
      return;
    }

    setSupertonicStarting(true);
    setSupertonicStatus("Starting Supertonic…");
    const result = await ensureSupertonicVoice();
    setSupertonicStarting(false);

    if (!result.ok) {
      setSupertonicStatus(result.message);
      return;
    }

    setSupertonicStatus("Supertonic ready");
    setUseHuggingFace(true);
  };

  return (
    <SettingsSection
      title="Voice alerts"
      description="Configure how Meshy speaks heal events, alerts, and voice chat."
      tooltip="These settings apply to Meshy voice chat and automatic heal announcements."
      icon={<Mic className="h-5 w-5 text-violet-500" />}
    >
      <div className="space-y-6">
        <div
          className={cn(
            "rounded-lg border p-4 transition-all",
            enabled
              ? "border-violet-400/40 bg-violet-50/50 dark:bg-violet-950/20"
              : "bg-muted/20",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full border",
                  enabled
                    ? "border-violet-400 bg-violet-100 dark:bg-violet-900/40"
                    : "border-border bg-background",
                )}
              >
                {enabled ? (
                  <Mic className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                ) : (
                  <MicOff className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold">Announce heal events</p>
                <p className="text-xs text-muted-foreground">
                  Speak aloud when pods are healed, fail, or escalate.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggle}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-all",
                  enabled
                    ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-700"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {enabled ? (
                  <>
                    <Volume2 className="h-4 w-4" />
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
                  try {
                    await speakMeshyText(meshyVoiceTestPhrase(voiceLanguage), {
                        useHuggingFace,
                        hfToken,
                        gender: voiceGender,
                        language: voiceLanguage,
                        rate: 0.88,
                      });
                  } finally {
                    setIsPlayingTest(false);
                  }
                }}
                disabled={isPlayingTest}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
              >
                <Play className={cn("h-4 w-4", isPlayingTest && "animate-spin")} />
                {isPlayingTest ? "Speaking…" : "Test voice"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Meshy voice</h3>
          <p className="text-xs text-muted-foreground">
            One consistent voice for chat and alerts. Turn off neural voice below
            to use the same browser voice every time.
          </p>
          <div className="flex flex-wrap gap-2">
            {(["female", "male"] as const).map((gender) => (
              <button
                key={gender}
                type="button"
                onClick={() => setVoiceGender(gender)}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-all",
                  voiceGender === gender
                    ? "border-violet-500 bg-violet-600 text-white"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {gender} voice
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Voice language</h3>
          <p className="text-xs text-muted-foreground">
            Used for speech recognition and TTS. Non-English languages use
            Supertonic automatically when available.
          </p>
          <select
            value={voiceLanguage}
            onChange={(event) =>
              setVoiceLanguage(event.target.value as MeshyVoiceLanguage)
            }
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500"
          >
            {MESHY_VOICE_LANGUAGES.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
              <div>
                <h3 className="text-sm font-semibold">Neural AI voice (Supertonic 3)</h3>
                <p className="text-xs text-muted-foreground">
                  Local on-device TTS. Hugging Face token is optional cloud fallback.
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={useHuggingFace}
              disabled={supertonicStarting}
              onChange={() => void handleNeuralVoiceToggle()}
              label="Use neural AI voice"
            />
          </div>

          {(supertonicStarting || supertonicStatus) && (
            <p
              className={cn(
                "text-xs",
                supertonicStatus === "Supertonic ready"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : supertonicStarting
                    ? "text-violet-600 dark:text-violet-400"
                    : "text-amber-600 dark:text-amber-400",
              )}
            >
              {supertonicStarting
                ? "Starting Supertonic… (first run may take a minute)"
                : supertonicStatus}
            </p>
          )}

          {useHuggingFace && (
            <div className="space-y-2 border-t border-dashed pt-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium">
                  Hugging Face token (optional fallback)
                </label>
                <a
                  href="https://huggingface.co/settings/tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-xs text-violet-600 hover:underline"
                >
                  Get token <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <input
                type="password"
                placeholder="hf_..."
                value={hfToken}
                onChange={(event) => setHfToken(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500"
              />
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Event announcements</h3>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Speak when issue occurs</p>
              <p className="text-xs text-muted-foreground">
                Announce new alerts when they are detected.
              </p>
            </div>
            <ToggleSwitch
              checked={speakOnIssueOccurs}
              onChange={() => setSpeakOnIssueOccurs(!speakOnIssueOccurs)}
              label="Speak when issue occurs"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Speak when issue is resolved</p>
              <p className="text-xs text-muted-foreground">
                Announce when a heal succeeds, fails, or escalates.
              </p>
            </div>
            <ToggleSwitch
              checked={speakOnIssueResolved}
              onChange={() => setSpeakOnIssueResolved(!speakOnIssueResolved)}
              label="Speak when issue is resolved"
            />
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
