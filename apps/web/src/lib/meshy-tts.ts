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

export function loadMeshyVoiceGender(): MeshyVoiceGender {
  if (typeof window === "undefined") return "female";
  const stored = localStorage.getItem("meshy-voice-gender");
  return stored === "male" ? "male" : "female";
}

export function saveMeshyVoiceGender(gender: MeshyVoiceGender): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("meshy-voice-gender", gender);
  cachedVoiceUri = null;
  cachedGender = null;
}

function englishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
}

function matchesAny(name: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(name));
}

export function pickMeshyVoice(
  voices: SpeechSynthesisVoice[],
  gender: MeshyVoiceGender = loadMeshyVoiceGender(),
): SpeechSynthesisVoice | null {
  if (cachedVoiceUri && cachedGender === gender) {
    const cached = voices.find((v) => v.voiceURI === cachedVoiceUri);
    if (cached) return cached;
  }

  const en = englishVoices(voices);
  if (en.length === 0) return null;

  const patterns = gender === "female" ? FEMALE_PATTERNS : MALE_PATTERNS;
  const opposite =
    gender === "female" ? MALE_PATTERNS : FEMALE_PATTERNS;

  const ranked = en.filter((v) => matchesAny(v.name, patterns));
  if (ranked.length > 0) {
    const voice = ranked[0];
    cachedVoiceUri = voice.voiceURI;
    cachedGender = gender;
    return voice;
  }

  const neutral = en.filter((v) => !matchesAny(v.name, opposite));
  const voice = neutral[0] ?? en[0];
  cachedVoiceUri = voice.voiceURI;
  cachedGender = gender;
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
  options?: { rate?: number; gender?: MeshyVoiceGender },
): Promise<void> {
  if (typeof window === "undefined" || !text.trim()) return;

  const synth = window.speechSynthesis;
  if (!synth) return;

  synth.cancel();
  const voices = await waitForSpeechVoices(synth);
  const voice = pickMeshyVoice(voices, options?.gender ?? loadMeshyVoiceGender());

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.rate = options?.rate ?? 0.92;
    utterance.pitch = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    synth.speak(utterance);
  });
}

export async function speakWithHuggingFace(
  text: string,
  token: string,
  onAudio?: (audio: HTMLAudioElement) => void,
): Promise<boolean> {
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, token }),
    });
    if (!response.ok) return false;

    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    onAudio?.(audio);

    await new Promise<void>((resolve) => {
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      void audio.play().catch(() => resolve());
    });
    return true;
  } catch {
    return false;
  }
}

/** Hugging Face when enabled; otherwise pinned browser voice. */
export async function speakMeshyText(
  text: string,
  opts: {
    useHuggingFace: boolean;
    hfToken: string;
    gender?: MeshyVoiceGender;
    rate?: number;
    onAudio?: (audio: HTMLAudioElement) => void;
  },
): Promise<void> {
  if (opts.useHuggingFace && opts.hfToken) {
    const ok = await speakWithHuggingFace(text, opts.hfToken, opts.onAudio);
    if (ok) return;
  }
  await speakWithBrowserTts(text, {
    rate: opts.rate,
    gender: opts.gender,
  });
}
