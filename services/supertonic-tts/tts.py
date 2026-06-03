"""Local text-to-speech using Supertone/supertonic-3 (ONNX Runtime).

The model card recommends the official ``supertonic`` Python SDK — not the
Hugging Face ``transformers`` library — because weights are shipped as ONNX
artifacts downloaded from Hugging Face Hub on first run.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import onnxruntime as ort

_tts_engine = None


def _resolve_onnx_providers() -> list[str]:
    """Pick ONNX Runtime providers: GPU/accelerator when available, else CPU."""
    override = os.getenv("SUPERTONIC_ONNX_PROVIDERS", "").strip()
    if override:
        requested = [p.strip() for p in override.split(",") if p.strip()]
    else:
        available = set(ort.get_available_providers())
        requested = []
        for candidate in (
            "CUDAExecutionProvider",
            "CoreMLExecutionProvider",
            "DmlExecutionProvider",
            "CPUExecutionProvider",
        ):
            if candidate in available:
                requested.append(candidate)

    available = set(ort.get_available_providers())
    valid = [p for p in requested if p in available]
    return valid or ["CPUExecutionProvider"]


def _configure_huggingface_auth() -> None:
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")
    if token and not os.getenv("HUGGING_FACE_HUB_TOKEN"):
        os.environ["HUGGING_FACE_HUB_TOKEN"] = token


def _get_engine():
    global _tts_engine
    if _tts_engine is not None:
        return _tts_engine

    _configure_huggingface_auth()

    # supertonic reads DEFAULT_ONNX_PROVIDERS at model load time.
    import supertonic.config as supertonic_config

    supertonic_config.DEFAULT_ONNX_PROVIDERS = _resolve_onnx_providers()

    from supertonic import TTS

    model = os.getenv("SUPERTONIC_MODEL", "supertonic-3").strip() or "supertonic-3"
    _tts_engine = TTS(model=model, auto_download=True)
    return _tts_engine


def text_to_speech(
    text: str,
    output_file: str | os.PathLike[str],
    *,
    voice: Optional[str] = None,
    lang: Optional[str] = None,
    total_steps: int = 8,
    speed: float = 1.05,
) -> Path:
    """Synthesize ``text`` to a WAV file using Supertone/supertonic-3.

    Args:
        text: Input utterance.
        output_file: Destination ``.wav`` path.
        voice: Built-in voice name (M1–M5, F1–F5). Defaults to SUPERTONIC_VOICE or M1.
        lang: Language ISO code (en, ko, ja, …). Defaults to SUPERTONIC_LANG or en.
        total_steps: Quality steps (5–12, default 8 per model card).
        speed: Speech rate (0.7–2.0, default 1.05).

    Returns:
        Path to the written WAV file.
    """
    cleaned = text.strip()
    if not cleaned:
        raise ValueError("text must not be empty")

    out_path = Path(output_file).expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    tts = _get_engine()
    voice_name = (voice or os.getenv("SUPERTONIC_VOICE") or "M1").strip()
    language = (lang or os.getenv("SUPERTONIC_LANG") or "en").strip()

    style = tts.get_voice_style(voice_name=voice_name)
    wav, duration = tts.synthesize(
        cleaned,
        voice_style=style,
        lang=language,
        total_steps=total_steps,
        speed=speed,
    )
    tts.save_audio(wav, str(out_path))

    duration_sec = float(duration)
    providers = _resolve_onnx_providers()
    print(
        f"Saved {duration_sec:.2f}s audio to {out_path} "
        f"(voice={voice_name}, lang={language}, providers={providers})"
    )
    return out_path
