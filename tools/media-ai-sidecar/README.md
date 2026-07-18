# Beaman media AI sidecar

This optional local service computes image-pixel embeddings and review metadata without sending the bulk photo library to a paid API. It binds to `127.0.0.1` by default, keeps its SQLite/model cache and generated 768px JPEG review thumbnails outside the source media tree, and returns per-file errors so one unreadable photo does not stop a batch.

Scan, Analyze, and Full are resumable by file hash/cache state. The website exposes these through guided **Train selected**, **Improve page**, and **Continue library** actions so operators do not need to run individual steps manually. Repeat the same bounded command to continue changed or uncached files; completed leading paths are not reprocessed forever. Partial cluster runs replace membership only for their scoped paths, so unrelated cached clusters remain intact.

The Studio remains usable when this service is offline. Automation only proposes review evidence; it never marks an image reviewed, assigns it to a published piece, or replaces the manual alt-text gate. Manual accepted assignments and rejected suggestions are stored in the app database as training labels; those labels are used by the website ranker alongside the sidecar vectors.

Heavy work is single-flight in-process and, when CUDA is selected, guarded by a cross-process GPU lease beside the cache. Concurrent requests receive an honest `busy` response. Health reports the active action, last outcome, selected backend, actual PyTorch/CUDA versions, allocator memory, lease owner, indexed-cache queue counts, and restart semantics without loading the model merely to answer a probe.

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
$env:MEDIA_AI_ACCELERATOR = 'auto'
$env:MEDIA_AI_GPU_MEMORY_LIMIT_MB = '4096'
.\scripts\run-sidecar.ps1 -HostAddress 0.0.0.0
```

When binding beyond loopback, set `MEDIA_AI_SIDECAR_TOKEN`, allow only the NAS IP through the host firewall, and set the same value as `LOCAL_AI_SIDECAR_TOKEN` in the website environment. Set `LOCAL_AI_SIDECAR_URL` to an address reachable **from the container**, not `127.0.0.1` unless the sidecar runs in that same container.

The server rejects a non-loopback bind without a token. `scripts/probe-sidecar.ps1` verifies authenticated health and, without printing either token, proves that an intentionally wrong bearer value receives HTTP 401. To supervise restart after a crash, run `scripts/run-sidecar-supervised.ps1` from a restricted user session or a Task Scheduler entry. Clean shutdown is not restarted by default; nonzero exits restart after a bounded delay. Active requests are synchronous and stop on process exit, while the external SQLite cache makes the next bounded scan/embed/analyze/cluster request resumable.

## Run on WSL or a GPU host

```bash
export MEDIA_AI_MEDIA_ROOT=/mnt/y/homes/Cooper/Photos/Dad_Woodworking_09262025
export MEDIA_AI_CACHE=$HOME/.cache/beaman-media-ai/cache.sqlite
export MEDIA_AI_SIDECAR_TOKEN='<long-random-token>'
python -m media_ai_sidecar --host 0.0.0.0 --port 8765
```

## Accelerator and shared-GPU contract

`MEDIA_AI_ACCELERATOR` accepts `auto`, `cpu`, or `cuda`. `auto` uses CUDA only when PyTorch reports the configured `MEDIA_AI_CUDA_DEVICE`; otherwise it records the reason and uses CPU. `cpu` never loads the model onto CUDA. `cuda` fails startup when CUDA is unavailable. `MEDIA_AI_EMBED_BATCH_SIZE` is bounded from 1 through 64. `MEDIA_AI_GPU_MEMORY_LIMIT_MB` applies PyTorch's per-process allocator fraction before model load and is capped at 90 percent of visible VRAM. `MEDIA_AI_GPU_LEASE_FILE` can point multiple supervised sidecar processes at the same cross-process lease; by default it is stored beside `MEDIA_AI_CACHE`.

Automatic CUDA runtime/OOM failure clears CUDA model state, retries the failed inference batch on CPU, and records `fallbackReason`. Forced `cuda` does not silently fall through. The website still treats every result as review evidence: accelerator choice never bypasses manual identity, alt-text, assignment, or publication approval.

The 2026-07-18 representative benchmark used twelve disposable copies from the mounted photo library, three inference passes per backend, SentenceTransformers 5.4.1, PyTorch 2.11.0+cu128, and the RTX 3070 Ti Laptop GPU. CPU median inference was 0.488176 seconds; CUDA median was 0.129774 seconds with 670 MiB peak reserved VRAM. All twelve images retained the same eight-label ranking; maximum CPU/CUDA score drift was 0.000105856, below the benchmark's 0.001 semantic threshold. The sidecar therefore selects CUDA in `auto` on this host. The visual archive currently has no verified CUDA stage and remains CPU/SwiftShader, so the two workloads do not contend. If a future audit stage adopts CUDA, configure both processes around one operator-controlled maintenance window and shared host lease before concurrent execution.

Reproduce the decision against read-only or disposable media:

```powershell
python -m media_ai_sidecar.benchmark `
  --corpus C:\restricted\representative-copies `
  --repeats 3 --limit 12 --batch-size 12 `
  --gpu-memory-limit-mib 4096
```

The benchmark defaults to `local_files_only=True`; add `--allow-download` only during an intentional model-provisioning step. It prints timings, versions, device memory, semantic digests, label-ranking equivalence, and maximum score drift as one JSON record. It never writes to the corpus.

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

Only one heavy batch runs at a time. Concurrent batch requests receive a structured `busy` response instead of starting duplicate model work or racing SQLite writes.

Example health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health -Headers @{ Authorization = "Bearer $env:MEDIA_AI_SIDECAR_TOKEN" }
```

`queue.scope` is `indexed-cache-only`: pending embedding, analysis, and clustering counts cover files already present in the cache. Files not yet discovered by a scan remain intentionally unknown until the next bounded scan. This avoids recursively walking the entire NAS library on every health request.

## Validation

```powershell
python -m media_ai_sidecar --help
python -m unittest discover -s tests -v
python -m compileall -q media_ai_sidecar tests
```

Official device behavior is documented by [SentenceTransformers device selection](https://sbert.net/docs/package_reference/sentence_transformer/model.html) and [PyTorch CUDA memory limits](https://docs.pytorch.org/docs/stable/generated/torch.cuda.memory.set_per_process_memory_fraction.html).
