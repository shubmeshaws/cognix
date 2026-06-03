import type { MeshyVoiceLanguage } from "@/lib/meshy-voice-language";
import {
  loadMeshyVoiceLanguage,
  meshyLanguageToSpeechRecognitionLang,
} from "@/lib/meshy-voice-language";

export type MeshyVoiceGender = "female" | "male";

const FEMALE_PATTERNS = [
  /samantha/i,
  /karen/i,
  /victoria/i,
  /zira/i,
  /female/i,
  /woman/i,
  /fiona/i,
  /moira/i,
  /tessa/i,
  /veena/i,
  /google.*english.*female/i,
  /microsoft.*zira/i,
];

const MALE_PATTERNS = [
  /daniel/i,
  /alex(?!a)/i,
  /david/i,
  /fred/i,
  /male/i,
  /man\b/i,
  /google.*english.*male/i,
  /microsoft.*david/i,
  /microsoft.*mark/i,
];

let cachedVoiceUri: string | null = null;
let cachedGender: MeshyVoiceGender | null = null;
let cachedLanguage: MeshyVoiceLanguage | null = null;

function matchesAny(name: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(name));
}

export function loadMeshyVoiceGender(): MeshyVoiceGender {
  if (typeof window === "undefined") return "female";
  const stored = localStorage.getItem("meshy-voice-gender");
  return stored === "male" ? "male" : "female";
}

export function saveMeshyVoiceGender(gender: MeshyVoiceGender): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("meshy-voice-gender", gender);
  resetMeshyVoiceCache();
}

export function resetMeshyVoiceCache(): void {
  cachedVoiceUri = null;
  cachedGender = null;
  cachedLanguage = null;
}

function voicesForLanguage(
  voices: SpeechSynthesisVoice[],
  language: MeshyVoiceLanguage = loadMeshyVoiceLanguage(),
): SpeechSynthesisVoice[] {
  const prefix = language.toLowerCase();
  const matched = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  if (matched.length > 0) return matched;
  return voices.filter((v) => v.lang.toLowerCase().includes(prefix));
}

export function pickMeshyVoice(
  voices: SpeechSynthesisVoice[],
  gender: MeshyVoiceGender = loadMeshyVoiceGender(),
  language: MeshyVoiceLanguage = loadMeshyVoiceLanguage(),
): SpeechSynthesisVoice | null {
  if (
    cachedVoiceUri &&
    cachedGender === gender &&
    cachedLanguage === language
  ) {
    const cached = voices.find((v) => v.voiceURI === cachedVoiceUri);
    if (cached) return cached;
  }

  const localized = voicesForLanguage(voices, language);
  const pool = localized.length > 0 ? localized : voices;

  const patterns = gender === "female" ? FEMALE_PATTERNS : MALE_PATTERNS;
  const opposite =
    gender === "female" ? MALE_PATTERNS : FEMALE_PATTERNS;

  const ranked = pool.filter((v) => matchesAny(v.name, patterns));
  if (ranked.length > 0) {
    const voice = ranked[0];
    cachedVoiceUri = voice.voiceURI;
    cachedGender = gender;
    cachedLanguage = language;
    return voice;
  }

  const neutral = pool.filter((v) => !matchesAny(v.name, opposite));
  const voice = neutral[0] ?? pool[0] ?? null;
  if (voice) {
    cachedVoiceUri = voice.voiceURI;
    cachedGender = gender;
    cachedLanguage = language;
  }
  return voice;
}

export async function waitForSpeechVoices(
  synth: SpeechSynthesis,
): Promise<SpeechSynthesisVoice[]> {
  let voices = synth.getVoices();
  if (voices.length > 0) return voices;

  return new Promise((resolve) => {
    const finish = () => resolve(synth.getVoices());
    const onChange = () => {
      synth.removeEventListener("voiceschanged", onChange);
      finish();
    };
    synth.addEventListener("voiceschanged", onChange);
    window.setTimeout(() => {
      synth.removeEventListener("voiceschanged", onChange);
      finish();
    }, 800);
  });
}

export async function speakWithBrowserTts(
  text: string,
  options?: {
    rate?: number;
    gender?: MeshyVoiceGender;
    language?: MeshyVoiceLanguage;
    signal?: AbortSignal;
  },
): Promise<void> {
  if (typeof window === "undefined" || !text.trim() || options?.signal?.aborted) {
    return;
  }

  const synth = window.speechSynthesis;
  if (!synth) return;

  synth.cancel();
  const voices = await waitForSpeechVoices(synth);
  if (options?.signal?.aborted) return;
  const language = options?.language ?? loadMeshyVoiceLanguage();
  const voice = pickMeshyVoice(
    voices,
    options?.gender ?? loadMeshyVoiceGender(),
    language,
  );

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = meshyLanguageToSpeechRecognitionLang(language);
    if (voice) utterance.voice = voice;
    utterance.rate = options?.rate ?? 0.92;
    utterance.pitch = 1;
    const finish = () => resolve();
    utterance.onend = finish;
    utterance.onerror = finish;
    options?.signal?.addEventListener("abort", () => {
      synth.cancel();
      finish();
    }, { once: true });
    if (options?.signal?.aborted) {
      finish();
      return;
    }
    synth.speak(utterance);
  });
}

export async function ensureSupertonicVoice(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const res = await fetch("/api/tts/ensure", { method: "POST" });
    const data = (await res.json()) as { ok?: boolean; message?: string };
    return {
      ok: Boolean(data.ok),
      message: data.message ?? (data.ok ? "Supertonic ready" : "Supertonic unavailable"),
    };
  } catch {
    return { ok: false, message: "Could not reach TTS service" };
  }
}

export async function speakWithHuggingFace(
  text: string,
  token: string,
  onAudio?: (audio: HTMLAudioElement) => void,
  voiceGender: MeshyVoiceGender = loadMeshyVoiceGender(),
  language: MeshyVoiceLanguage = loadMeshyVoiceLanguage(),
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return false;

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, token, voiceGender, lang: language }),
      signal,
    });
    if (!response.ok) return false;
    if (signal?.aborted) return false;

    const blob = await response.blob();
    if (signal?.aborted) return false;

    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    onAudio?.(audio);

    await new Promise<void>((resolve) => {
      const done = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      const onAbort = () => {
        audio.pause();
        done();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      audio.onended = done;
      audio.onerror = done;
      audio.onpause = () => {
        if (!audio.ended) done();
      };
      void audio.play().catch(done);
    });
    return !signal?.aborted;
  } catch (err) {
    if (signal?.aborted) return false;
    if (err instanceof DOMException && err.name === "AbortError") return false;
    return false;
  }
}

/** Supertonic (local) when server is up; Hugging Face cloud as fallback; else browser voice. */
export async function speakMeshyText(
  text: string,
  opts: {
    useHuggingFace: boolean;
    hfToken: string;
    gender?: MeshyVoiceGender;
    language?: MeshyVoiceLanguage;
    rate?: number;
    onAudio?: (audio: HTMLAudioElement) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const language = opts.language ?? loadMeshyVoiceLanguage();
  const tryNeuralTts = opts.useHuggingFace || language !== "en";

  if (tryNeuralTts) {
    const ok = await speakWithHuggingFace(
      text,
      opts.hfToken,
      opts.onAudio,
      opts.gender ?? loadMeshyVoiceGender(),
      language,
      opts.signal,
    );
    if (ok) return;
  }

  if (opts.signal?.aborted) return;

  await speakWithBrowserTts(text, {
    rate: opts.rate,
    gender: opts.gender,
    language,
    signal: opts.signal,
  });
}
