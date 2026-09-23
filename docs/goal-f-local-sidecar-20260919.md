# Goal F local media AI operational proof — September 19, 2026

The configured local sidecar was stopped. No matching listener, Scheduled Task, service, Startup item or HKCU Run entry existed. Production authenticated health timed out. The installed venv/cache and NAS media share were present. This was an operational ACTIVE_GAP, not a cloud credential blocker.

## Root cause and repair

One owner-logon Scheduled Task, **Beaman Woodworks Media AI**, now starts a restricted operator wrapper under `%LOCALAPPDATA%/BeamanWoodworks/sidecar-operator`. It uses the repository's existing supervised runner, the existing venv and cache, and reads the existing bearer credential file into process environment. No credential is in task arguments or Git. The task runs with the owner's limited interactive token, ignores duplicate starts, permits battery operation and has no task execution timeout. The supervisor delays 30 seconds between failed exits and allows at most 120 restarts. Clean exits are not restarted.

The wrapper binds only `192.168.1.86:8765`, uses the existing UNC photo root and local cache, selects `auto` acceleration and requires locally cached models. The existing firewall rule already allows TCP 8765 only from NAS addresses `192.168.1.125` and `192.168.1.126`; it was not widened. No paid provider, Ollama, cleanup or public generative-rendering feature was enabled.

The real launch exposed a UNC runner defect: PowerShell `Resolve-Path.Path` included `Microsoft.PowerShell.Core/FileSystem::` provider syntax. Python consequently rejected the existing directory. The runner now uses `ProviderPath` for media and cache-parent filesystem comparisons. This does not change source media or application behavior.

Installed package version 1.0.0 was older than current repository code despite sharing its version number: health lacked accelerator/work/queue fields. The local package alone was installed from the authoritative source using `pip install --no-deps --no-build-isolation`; the existing venv, models, dependencies and cache were retained. Wheel SHA-256: `f78168fe2c718d589e5a029fc38475c6c7d009d5f062b55ae6c9bc9a0c590b87`.

## Current acceptance

- Local authenticated health: 200; intentionally wrong bearer: 401. Media root readable.
- The unchanged production container authenticated to the configured endpoint: 200. No production app restart/config/schema/data change.
- Python 3.13.12, SentenceTransformers 5.6.0, PyTorch 2.11.0+cu128, CUDA 12.8; `auto` selects RTX 3070 Ti Laptop GPU / `cuda:0`. Model: `sentence-transformers/clip-ViT-B-32`. Batch 16; allocator bound 4915 MiB; observed post-inference reserved memory 634 MiB.
- Only the two already-proven public dining-table files were selected. Scan, image embeddings (512 dimensions), analysis and clustering all succeeded; one cluster has two members. Two text embeddings also returned 512 dimensions. Repeat scan reported both up to date; repeat embeddings and analyses were cache hits. Source SHA-256 values before/after were identical; no originals, assignments or publication states changed.
- Cache `quick_check=ok`; after the two-file sample: 383 indexed files, 373 embeddings, 285 analyses, 15 cluster memberships. These are cache totals, not claims of full-library coverage or editorial identity.
- A controlled idle sidecar process exit was recovered by the existing supervisor, with a new healthy PID and identical cache totals. No application container was disturbed. The task and listener remain running.
- The current `search-rerank.ts` used real sidecar text vectors and returned `applied`. A disposable loopback service returning 503 produced `unavailable` with exactly unchanged lexical results. The intended sidecar stayed available during this fallback proof.
- Sidecar Python tests: 7/7 PASS. Search reranking/failure/timeout tests: 4/4 PASS. Media scoring/training suppression tests: 5/5 PASS. Real UNC launch proves the runner correction. These are focused packet checks, not the final Goal-F application gates.

Restricted evidence: `sidecar-production-health.json`, `sidecar-bounded-acceptance.json`, `sidecar-semantic-acceptance.json`, `sidecar-restart-proof.json` under `/home/cbeaman/woodsmith-goal-f-20260912`. Raw vectors and bearer values are not included in the committed report.

## Feature truth

Local analysis, true pixel embeddings, clustering and semantic enrichment now have current execution proof. Manual correction remains authoritative: accepted/rejected labels in `actions.ts` and `media-audit.ts` affect scores and suppress rejected suggestions; AI results never independently grant reviewed/public status. Current production has 53 accepted labels, while rejected-label behavior is covered by source and focused tests rather than a fabricated production rejection. Folder/date grouping also handles video; CLIP image analysis does not claim video-frame understanding.

FTS remains the core search path; semantic work only reranks up to 24 existing candidates with a 100–2500 ms deadline and honest lexical fallback. Optional OpenAI cleanup and photorealistic rendering require explicit flags and credentials and remain disabled/OPTIONAL_PROVIDER_ENHANCEMENT. Local analysis is functional; paid cloud enrichment is not required for it. The deterministic R3F commission visualizer remains the required core and is unchanged.

## Owner operation and limits

The owner must be logged in and the host/NAS share reachable for this interactive task to run. This is a durable owner-logon service, not a claim of unattended pre-logon or sleeping-host availability. Offline periods retain honest lexical/manual behavior. Task Scheduler can start the task on demand; its single-instance setting prevents competing scheduled copies. Token rotation remains operator-owned and must match the application's secure environment.

For maintenance, stop the Scheduled Task first, then terminate only its positively identified `sidecar-operator/run-sidecar.ps1` child process tree; ending a PowerShell task alone can leave Python children running. Check port 8765 before restarting. Do not kill unrelated Python processes. Keep the wrapper/runner copies and venv package aligned with reviewed repository updates. Cache/model files and credentials remain outside the source media tree and Git. No production application release has occurred in this packet.
