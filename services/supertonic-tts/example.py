#!/usr/bin/env python3
"""Minimal Supertonic 3 TTS example."""

from pathlib import Path

from tts import text_to_speech

OUTPUT = Path(__file__).resolve().parent / "output" / "hello.wav"

if __name__ == "__main__":
    text_to_speech(
        "A gentle breeze moved through the open window while everyone listened to the story.",
        OUTPUT,
    )
    print(f"Done — play {OUTPUT}")
