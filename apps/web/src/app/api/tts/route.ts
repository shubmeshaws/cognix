import { NextResponse } from "next/server";

import { cleanTextForSpeech } from "@/lib/voice";

export async function POST(request: Request) {
  try {
    const { text, token } = await request.json();
    
    if (!text || !token) {
      return NextResponse.json({ error: "Missing text or token" }, { status: 400 });
    }

    const cleanText = cleanTextForSpeech(String(text));
    const response = await fetch(
      "https://api-inference.huggingface.co/models/facebook/mms-tts-eng",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ inputs: cleanText }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Hugging Face API failed: ${errText}` },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    
    return new Response(audioBuffer, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "audio/flac",
      },
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { error: errMessage },
      { status: 500 }
    );
  }
}
