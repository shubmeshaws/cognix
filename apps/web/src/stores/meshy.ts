import { create } from "zustand";
import { useState, useEffect } from "react";

interface MeshyState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
  hfToken: string;
  setHfToken: (token: string) => void;
  useHuggingFace: boolean;
  setUseHuggingFace: (use: boolean) => void;
  speakOnIssueOccurs: boolean;
  setSpeakOnIssueOccurs: (speak: boolean) => void;
  speakOnIssueResolved: boolean;
  setSpeakOnIssueResolved: (speak: boolean) => void;
}

function loadEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("meshy-ai-enabled") === "true";
}

function loadHfToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("meshy-hf-token") || "";
}

function loadUseHuggingFace(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("meshy-use-hf") === "true";
}

function loadSpeakOnIssueOccurs(): boolean {
  if (typeof window === "undefined") return true;
  const val = localStorage.getItem("meshy-speak-occurs");
  return val === null ? true : val === "true";
}

function loadSpeakOnIssueResolved(): boolean {
  if (typeof window === "undefined") return true;
  const val = localStorage.getItem("meshy-speak-resolved");
  return val === null ? true : val === "true";
}

export const useMeshyStore = create<MeshyState>((set, get) => ({
  enabled: loadEnabled(),
  hfToken: loadHfToken(),
  useHuggingFace: loadUseHuggingFace(),
  speakOnIssueOccurs: loadSpeakOnIssueOccurs(),
  speakOnIssueResolved: loadSpeakOnIssueResolved(),

  setEnabled: (enabled) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("meshy-ai-enabled", String(enabled));
      if (!enabled) {
        window.speechSynthesis?.cancel();
      }
    }
    set({ enabled });
  },

  toggle: () => get().setEnabled(!get().enabled),

  setHfToken: (token) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("meshy-hf-token", token);
    }
    set({ hfToken: token });
  },

  setUseHuggingFace: (use) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("meshy-use-hf", String(use));
    }
    set({ useHuggingFace: use });
  },

  setSpeakOnIssueOccurs: (speak) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("meshy-speak-occurs", String(speak));
    }
    set({ speakOnIssueOccurs: speak });
  },

  setSpeakOnIssueResolved: (speak) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("meshy-speak-resolved", String(speak));
    }
    set({ speakOnIssueResolved: speak });
  },
}));

/**
 * A Next.js/SSR-safe hook to access MeshyStore.
 * Avoids hydration mismatches by returning false until mounted on the client.
 */
export function useMeshy() {
  const store = useMeshyStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return {
    enabled: mounted ? store.enabled : false,
    toggle: store.toggle,
    setEnabled: store.setEnabled,
    hfToken: mounted ? store.hfToken : "",
    setHfToken: store.setHfToken,
    useHuggingFace: mounted ? store.useHuggingFace : false,
    setUseHuggingFace: store.setUseHuggingFace,
    speakOnIssueOccurs: mounted ? store.speakOnIssueOccurs : true,
    setSpeakOnIssueOccurs: store.setSpeakOnIssueOccurs,
    speakOnIssueResolved: mounted ? store.speakOnIssueResolved : true,
    setSpeakOnIssueResolved: store.setSpeakOnIssueResolved,
  };
}
