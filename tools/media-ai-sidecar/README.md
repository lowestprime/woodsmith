# Beaman media AI sidecar

This optional local service computes image-pixel embeddings and review metadata without sending the bulk photo library to a paid API. It binds to `127.0.0.1` by default, keeps its SQLite/model cache outside the source media tree, and returns per-file errors so one unreadable photo does not stop a batch.

The Studio remains usable when this service is offline. Automation only proposes review evidence; it never marks an image reviewed, assigns it to a published piece, or replaces the manual alt-text gate.

## Install

Python 3.11 or newer is required. Create a dedicated environment on the laptop or GPU host:

```powershell
cd tools/media-ai-sidecar
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[ai]"
```

The default model is `sentence-transformers/clip-ViT-B-32`. SentenceTransformers documents that this model maps images and text into one shared vector space for image search, clustering, duplicate discovery, and zero-shot classification: <https://sbert.net/examples/sentence_transformer/applications/image-search/README.html>.

## Run on Windows

Use the mapped Synology path and a cache path that is **not** inside the photo library:

```powershell
$env:MEDIA_AI_MEDIA_ROOT = 'Y:\homes\Cooper\Photos\Dad_Woodworking_09262025'
$env:MEDIA_AI_CACHE = "$env:LOCALAPPDATA\BeamanWoodworks\media-ai.sqlite"
$env:MEDIA_AI_SIDECAR_TOKEN = '<long-random-token>'
python -m media_ai_sidecar --host 0.0.0.0 --port 8765
```

When binding beyond loopback, set `MEDIA_AI_SIDECAR_TOKEN`, allow only the NAS IP through the host firewall, and set the same value as `LOCAL_AI_SIDECAR_TOKEN` in the website environment. Set `LOCAL_AI_SIDECAR_URL` to an address reachable **from the container**, not `127.0.0.1` unless the sidecar runs in that same container.

## Run on WSL or a GPU host

```bash
export MEDIA_AI_MEDIA_ROOT=/mnt/y/homes/Cooper/Photos/Dad_Woodworking_09262025
export MEDIA_AI_CACHE=$HOME/.cache/beaman-media-ai/cache.sqlite
export MEDIA_AI_SIDECAR_TOKEN='<long-random-token>'
python -m media_ai_sidecar --host 0.0.0.0 --port 8765
```

PyTorch uses CUDA automatically when the installed build and GPU support it; otherwise the model runs on CPU.

## Optional Ollama arbitration

The CLIP pass handles bulk embedding and deterministic zero-shot labels. Ollama is used only for ambiguous images or explicit vision re-analysis:

```powershell
$env:MEDIA_AI_USE_OLLAMA = 'true'
$env:OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
$env:OLLAMA_VISION_MODEL = 'gemma4'
```

Install the configured vision model in Ollama before use. Ollama accepts base64 images at `/api/chat` and supports JSON-schema structured output; see <https://docs.ollama.com/capabilities/vision> and <https://docs.ollama.com/capabilities/structured-outputs>.

Gemini fallback is also optional. Set `ENABLE_GEMINI_FALLBACK=true`, `GEMINI_API_KEY`, and `GEMINI_VISION_MODEL`; it is never used for bulk embedding by default.

## API

- `GET /health`
- `POST /scan`
- `POST /embed`
- `POST /analyze`
- `POST /cluster`
- `POST /rank`
- `POST /full`
- `POST /cancel`

POST bodies accept `selectedPaths`, `pieces`, `texts`, `limit`, and `dryRun` where relevant. Paths are resolved under `MEDIA_AI_MEDIA_ROOT`; traversal outside that root is rejected. Processing is synchronous and bounded by `MEDIA_AI_MAX_BATCH`, so `cancel` honestly reports that there is no fake background job to stop.

Example health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health -Headers @{ Authorization = "Bearer $env:MEDIA_AI_SIDECAR_TOKEN" }
```

## Validation

```powershell
python -m media_ai_sidecar --help
python -m unittest discover -s tests -v
```
