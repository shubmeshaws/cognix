import { NextResponse } from "next/server";

import { ensureSupertonicServer, isSupertonicReachable, SUPERTONIC_BASE } from "@/lib/supertonic-server";
import { cleanTextForSpeech } from "@/lib/voice";

const SUPERTONIC_LANG = process.env.SUPERTONIC_LANG ?? "en";
const SUPERTONIC_VOICE_FEMALE = process.env.SUPERTONIC_VOICE_FEMALE ?? "F1";
const SUPERTONIC_VOICE_MALE = process.env.SUPERTONIC_VOICE_MALE ?? "M1";
const HF_MODEL =
  process.env.HF_TTS_MODEL ?? "facebook/mms-tts-eng";

type VoiceGender = "female" | "male";

const VALID_LANGS = new Set([
  "en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi", "fr",
  "hi", "hr", "hu", "id", "it", "lt", "lv", "nl", "pl", "pt", "ro", "ru", "sk",
  "sl", "sv", "tr", "uk", "vi",
]);

function resolveLang(requested: unknown): string {
  if (typeof requested === "string") {
    const code = requested.trim().toLowerCase();
    if (VALID_LANGS.has(code)) return code;
  }
  return SUPERTONIC_LANG;
}

async function synthesizeWithSupertonic(
  text: string,
  voiceGender: VoiceGender,
  lang: string,
): Promise<Response | null> {
  const voice =
    voiceGender === "male" ? SUPERTONIC_VOICE_MALE : SUPERTONIC_VOICE_FEMALE;

  try {
    const response = await fetch(`${SUPERTONIC_BASE}/v1/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice,
        lang,
        steps: 8,
        speed: 1.05,
        response_format: "wav",
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      return null;
    }

    const audioBuffer = await response.arrayBuffer();
    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/wav",
      },
    });
  } catch {
    return null;
  }
}

async function synthesizeWithHuggingFace(
  text: string,
  token: string,
): Promise<Response> {
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${HF_MODEL}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({ inputs: text }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `Hugging Face API failed: ${errText}` },
      { status: response.status },
    );
  }

  const audioBuffer = await response.arrayBuffer();
  return new Response(audioBuffer, {
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "audio/flac",
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = body?.text;
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const voiceGender: VoiceGender =
      body?.voiceGender === "male" ? "male" : "female";
    const lang = resolveLang(body?.lang);

    if (!text || !String(text).trim()) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const cleanText = cleanTextForSpeech(String(text));

    if (!(await isSupertonicReachable())) {
      await ensureSupertonicServer();
    }

    const supertonic = await synthesizeWithSupertonic(cleanText, voiceGender, lang);
    if (supertonic) {
      return supertonic;
    }

    if (token) {
      return synthesizeWithHuggingFace(cleanText, token);
    }

    return NextResponse.json(
      {
        error:
          "Supertonic TTS could not start automatically. Ensure Python 3 is installed, or paste a Hugging Face token as fallback.",
      },
      { status: 503 },
    );
  } catch (error) {
    const errMessage =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errMessage }, { status: 500 });
  }
}
