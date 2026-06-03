"use client";

import { useEffect, useRef } from "react";
import { useClusterStore } from "@/stores/cluster";
import { useMeshyStore } from "@/stores/meshy";
import { speakMeshyText } from "@/lib/meshy-tts";

/** Watches heal and alert events and announces them aloud via Hugging Face TTS / Web Speech API. */
export function useMeshyAI() {
  const {
    enabled,
    useHuggingFace,
    hfToken,
    voiceGender,
    voiceLanguage,
    speakOnIssueOccurs,
    speakOnIssueResolved,
  } = useMeshyStore();
  const heals = useClusterStore((s) => s.heals);
  const alerts = useClusterStore((s) => s.alerts);

  const announcedHealsRef = useRef<Set<string>>(new Set());
  const announcedAlertsRef = useRef<Set<string>>(new Set());
  const initialSyncDone = useRef(false);

  useEffect(() => {
    try {
      const rawHeals = sessionStorage.getItem("meshy-announced-heals");
      if (rawHeals) announcedHealsRef.current = new Set(JSON.parse(rawHeals) as string[]);

      const rawAlerts = sessionStorage.getItem("meshy-announced-alerts");
      if (rawAlerts) announcedAlertsRef.current = new Set(JSON.parse(rawAlerts) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      initialSyncDone.current = false;
      return;
    }

    if (!initialSyncDone.current) {
      heals.forEach((h) => announcedHealsRef.current.add(h.id));
      alerts.forEach((a) => announcedAlertsRef.current.add(a.id));
      try {
        sessionStorage.setItem("meshy-announced-heals", JSON.stringify([...announcedHealsRef.current]));
        sessionStorage.setItem("meshy-announced-alerts", JSON.stringify([...announcedAlertsRef.current]));
      } catch {}
      initialSyncDone.current = true;
      return;
    }

    const runSpeech = async () => {
      const itemsToSpeak: { id: string; text: string; type: "heal" | "alert" }[] = [];

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

      if (speakOnIssueOccurs) {
        const newAlerts = alerts.filter((a) => !announcedAlertsRef.current.has(a.id));
        for (const a of newAlerts) {
          const text = `Meshy AI Alert. Issue occurred on pod, ${a.podName}, in namespace, ${a.namespace}. ${a.message}`;
          itemsToSpeak.push({ id: a.id, text, type: "alert" });
        }
      }

      for (const item of itemsToSpeak) {
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

        await speakMeshyText(item.text, {
          useHuggingFace,
          hfToken,
          gender: voiceGender,
          language: voiceLanguage,
          rate: 0.88,
        });
      }
    };

    void runSpeech();
  }, [
    heals,
    alerts,
    enabled,
    useHuggingFace,
    hfToken,
    voiceGender,
    voiceLanguage,
    speakOnIssueOccurs,
    speakOnIssueResolved,
  ]);

  return { enabled };
}
