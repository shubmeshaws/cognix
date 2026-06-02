/* eslint-disable @typescript-eslint/no-explicit-any */

export type SpeechRecognitionErrorCode =
  | "aborted"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "not-allowed"
  | "service-not-allowed"
  | "bad-grammar"
  | "language-not-supported";

export interface MeshySpeechRecognitionHandlers {
  onStart?: () => void;
  /** Benign codes (aborted, no-speech) are swallowed — never logged. */
  onError?: (code: SpeechRecognitionErrorCode) => void;
  onResult?: (event: any) => void;
  onEnd?: () => void;
}

export function isBenignSpeechError(code: string | undefined): boolean {
  return !code || code === "aborted" || code === "no-speech";
}

export function createMeshySpeechRecognition(
  handlers: MeshySpeechRecognitionHandlers,
): any | null {
  if (typeof window === "undefined") return null;

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang =
    typeof navigator !== "undefined"
      ? navigator.language || "en-US"
      : "en-US";

  recognition.onstart = () => handlers.onStart?.();

  recognition.onerror = (event: any) => {
    const code = event?.error as SpeechRecognitionErrorCode | undefined;
    if (isBenignSpeechError(code)) return;
    handlers.onError?.(code!);
  };

  recognition.onresult = (event: any) => handlers.onResult?.(event);
  recognition.onend = () => handlers.onEnd?.();

  return recognition;
}

export function destroyMeshySpeechRecognition(recognition: any | null): void {
  if (!recognition) return;
  recognition.onstart = null;
  recognition.onerror = null;
  recognition.onresult = null;
  recognition.onend = null;
  try {
    recognition.stop();
  } catch {
    /* ignore */
  }
}

export function startMeshySpeechRecognition(recognition: any | null): boolean {
  if (!recognition) return false;
  try {
    recognition.start();
    return true;
  } catch {
    return false;
  }
}

export function stopMeshySpeechRecognition(recognition: any | null): void {
  if (!recognition) return;
  try {
    recognition.stop();
  } catch {
    /* ignore */
  }
}
