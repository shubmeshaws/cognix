"use client";

import { useEffect, useRef } from "react";
import { useClusterStore } from "@/stores/cluster";
import { useMeshyStore } from "@/stores/meshy";

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

/** Watches heal and alert events and announces them aloud via Hugging Face TTS / Web Speech API. */
export function useMeshyAI() {
  const {
    enabled,
    useHuggingFace,
    hfToken,
    speakOnIssueOccurs,
    speakOnIssueResolved,
  } = useMeshyStore();
  const heals = useClusterStore((s) => s.heals);
  const alerts = useClusterStore((s) => s.alerts);

  const announcedHealsRef = useRef<Set<string>>(new Set());
  const announcedAlertsRef = useRef<Set<string>>(new Set());
  const initialSyncDone = useRef(false);

  // Restore announced IDs from sessionStorage so we don't re-speak after hot reload
  useEffect(() => {
    try {
      const rawHeals = sessionStorage.getItem("meshy-announced-heals");
      if (rawHeals) announcedHealsRef.current = new Set(JSON.parse(rawHeals) as string[]);

      const rawAlerts = sessionStorage.getItem("meshy-announced-alerts");
      if (rawAlerts) announcedAlertsRef.current = new Set(JSON.parse(rawAlerts) as string[]);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      initialSyncDone.current = false;
      return;
    }

    // When first enabled, mark all currently existing events in the store as "announced"
    // so we don't speak the historical backlog.
    if (!initialSyncDone.current) {
      heals.forEach((h) => announcedHealsRef.current.add(h.id));
      alerts.forEach((a) => announcedAlertsRef.current.add(a.id));
      try {
        sessionStorage.setItem("meshy-announced-heals", JSON.stringify([...announcedHealsRef.current]));
        sessionStorage.setItem("meshy-announced-alerts", JSON.stringify([...announcedAlertsRef.current]));
      } catch {}
      initialSyncDone.current = true;
      return; // Skip speech for this initial sync pass
    }

    const runSpeech = async () => {
      const itemsToSpeak: { id: string; text: string; type: "heal" | "alert" }[] = [];

      // Process Heals
      if (speakOnIssueResolved) {
        const newHeals = heals.filter(
          (h) =>
            (h.status === "healed" ||
              h.status === "failed" ||
              h.status === "escalated") &&
            !announcedHealsRef.current.has(h.id),
        );
        for (const h of newHeals) {
          const statusPhrase =
            h.status === "healed"
              ? "has been healed successfully"
              : h.status === "failed"
                ? "failed to heal"
                : "has been escalated to on-call";

          const text = `Meshy AI Alert. Pod, ${h.podName}, in namespace, ${h.namespace}, ${statusPhrase}. The detected issue was: ${h.issueType}.`;
          itemsToSpeak.push({ id: h.id, text, type: "heal" });
        }
      }

      // Process Alerts
      if (speakOnIssueOccurs) {
        const newAlerts = alerts.filter((a) => !announcedAlertsRef.current.has(a.id));
        for (const a of newAlerts) {
          const text = `Meshy AI Alert. Issue occurred on pod, ${a.podName}, in namespace, ${a.namespace}. ${a.message}`;
          itemsToSpeak.push({ id: a.id, text, type: "alert" });
        }
      }

      for (const item of itemsToSpeak) {
        // Mark as announced immediately to prevent race conditions
        if (item.type === "heal") {
          announcedHealsRef.current.add(item.id);
          try {
            sessionStorage.setItem("meshy-announced-heals", JSON.stringify([...announcedHealsRef.current]));
          } catch {}
        } else {
          announcedAlertsRef.current.add(item.id);
          try {
            sessionStorage.setItem("meshy-announced-alerts", JSON.stringify([...announcedAlertsRef.current]));
          } catch {}
        }

        let spoke = false;
        if (useHuggingFace && hfToken) {
          spoke = await speakWithHuggingFace(item.text, hfToken);
        }

        // Fallback to local SpeechSynthesis if HF was not selected, token is missing, or fetch failed
        if (!spoke) {
          const synth = window.speechSynthesis;
          if (synth) {
            const utterance = new SpeechSynthesisUtterance(item.text);
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
            utterance.rate = 0.88;
            utterance.pitch = 1.0;
            
            // Wait for local speech to finish before next item
            await new Promise<void>((resolve) => {
              utterance.onend = () => resolve();
              utterance.onerror = () => resolve();
              synth.speak(utterance);
            });
          }
        }
      }
    };

    runSpeech();
  }, [
    heals,
    alerts,
    enabled,
    useHuggingFace,
    hfToken,
    speakOnIssueOccurs,
    speakOnIssueResolved,
  ]);

  return { enabled };
}
