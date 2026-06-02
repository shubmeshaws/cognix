import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { text, token } = await request.json();
    
    if (!text || !token) {
      return NextResponse.json({ error: "Missing text or token" }, { status: 400 });
    }

    const cleanText = text.replace(/,/g, "").replace(/\./g, ""); // strip pauses for cloud model
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
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
