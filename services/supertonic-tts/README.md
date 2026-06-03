# Supertonic 3 TTS (local)

On-device text-to-speech for KubeHealer using [Supertone/supertonic-3](https://huggingface.co/Supertone/supertonic-3).

## Model stack

| Component | Role |
|-----------|------|
| [supertonic](https://pypi.org/project/supertonic/) | Official Python SDK (recommended on the model card) |
| [Hugging Face Hub](https://huggingface.co/Supertone/supertonic-3) | Downloads ONNX weights on first run (~400 MB) |
| ONNX Runtime | Inference (CPU by default; GPU when available) |

This model is **not** loaded via `transformers` — weights are ONNX files, not PyTorch checkpoints.

## Setup

```bash
cd services/supertonic-tts
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # optional: voice, language, HF token
```

### GPU (optional)

Supertonic 3 is designed for fast CPU inference. For NVIDIA GPU:

```bash
pip uninstall -y onnxruntime
pip install onnxruntime-gpu
```

Then set in `.env`:

```env
SUPERTONIC_ONNX_PROVIDERS=CUDAExecutionProvider,CPUExecutionProvider
```

On Apple Silicon, CoreML is auto-selected when available. On Windows, install `onnxruntime-directml` for DirectML.

### Environment variables

| Variable | Description |
|----------|-------------|
| `HF_TOKEN` / `HUGGING_FACE_HUB_TOKEN` | Optional Hugging Face token for downloads |
| `SUPERTONIC_MODEL` | Model id (`supertonic-3`, default) |
| `SUPERTONIC_MODEL_REPO` | HF repo override (`Supertone/supertonic-3`) |
| `SUPERTONIC_CACHE_DIR` | Model cache (default `~/.cache/supertonic3`) |
| `SUPERTONIC_VOICE` | Built-in voice: `M1`–`M5`, `F1`–`F5` (default `M1`) |
| `SUPERTONIC_LANG` | Language code: `en`, `ko`, `ja`, … or `na` (default `en`) |
| `SUPERTONIC_ONNX_PROVIDERS` | Comma-separated ONNX providers (auto if unset) |

First run downloads the model from Hugging Face into the cache directory.

## Usage

```python
from tts import text_to_speech

text_to_speech(
    "How many nodes are ready in my cluster?",
    "speech.wav",
    voice="F1",
    lang="en",
)
```

Or run the example script:

```bash
python example.py
# → services/supertonic-tts/output/hello.wav
```

## HTTP server (optional)

The SDK also ships an OpenAI-compatible local server:

```bash
pip install 'supertonic[serve]'
supertonic serve --host 127.0.0.1 --port 7788
```

See the [model card](https://huggingface.co/Supertone/supertonic-3) for `/v1/audio/speech` examples.

## License

Sample code: MIT. Model: OpenRAIL-M (see Hugging Face model page).
