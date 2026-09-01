from __future__ import annotations

import argparse
import gc
import hashlib
import json
import os
import statistics
import time
from pathlib import Path
from typing import Any

from .accelerator import probe_cuda
from .indexer import iter_media

LABELS = [
    "bench",
    "cabinet",
    "dining table",
    "desk",
    "footstool",
    "rack",
    "side table",
    "workshop process",
]


def _normalized(value: Any) -> list[float]:
    raw = value.tolist() if hasattr(value, "tolist") else value
    vector = [float(item) for item in raw]
    magnitude = sum(item * item for item in vector) ** 0.5
    return [item / magnitude for item in vector] if magnitude else vector


def _cosine(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right, strict=True))


def _semantic_result(images: list[list[float]], texts: list[list[float]]) -> dict[str, Any]:
    scores = [[_cosine(image, text) for text in texts] for image in images]
    rankings = [sorted(range(len(row)), key=lambda index: row[index], reverse=True) for row in scores]
    digest = hashlib.sha256(
        json.dumps(
            {
                "rankings": rankings,
                "scores": [[round(value, 7) for value in row] for row in scores],
            },
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    return {"scores": scores, "rankings": rankings, "digest": digest}


def _load_images(paths: list[Path]):
    from PIL import Image, ImageOps

    images = []
    for path in paths:
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
        image.thumbnail((768, 768))
        images.append(image)
    return images


def _run_backend(
    model_name: str,
    device: str,
    images: list[Any],
    repeats: int,
    batch_size: int,
    local_files_only: bool,
) -> dict[str, Any]:
    from sentence_transformers import SentenceTransformer

    started = time.perf_counter()
    model = SentenceTransformer(
        model_name,
        device=device,
        local_files_only=local_files_only,
    )
    load_seconds = time.perf_counter() - started
    runs = []
    semantic = None
    try:
        for index in range(repeats):
            run_started = time.perf_counter()
            image_started = time.perf_counter()
            image_vectors = model.encode(
                images,
                device=device,
                batch_size=batch_size,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
            image_seconds = time.perf_counter() - image_started
            text_started = time.perf_counter()
            text_vectors = model.encode(
                LABELS,
                device=device,
                batch_size=batch_size,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
            text_seconds = time.perf_counter() - text_started
            semantic = _semantic_result(
                [_normalized(value) for value in image_vectors],
                [_normalized(value) for value in text_vectors],
            )
            runs.append(
                {
                    "index": index + 1,
                    "imageSeconds": round(image_seconds, 6),
                    "textSeconds": round(text_seconds, 6),
                    "totalSeconds": round(time.perf_counter() - run_started, 6),
                    "semanticDigest": semantic["digest"],
                }
            )
        return {
            "device": device,
            "loadSeconds": round(load_seconds, 6),
            "runs": runs,
            "medianSeconds": round(statistics.median(run["totalSeconds"] for run in runs), 6),
            "semantic": semantic,
        }
    finally:
        del model
        gc.collect()


def _equivalence(cpu: dict[str, Any], cuda: dict[str, Any]) -> dict[str, Any]:
    cpu_semantic = cpu["semantic"]
    cuda_semantic = cuda["semantic"]
    differences = [
        abs(left - right)
        for cpu_row, cuda_row in zip(cpu_semantic["scores"], cuda_semantic["scores"], strict=True)
        for left, right in zip(cpu_row, cuda_row, strict=True)
    ]
    same_rankings = cpu_semantic["rankings"] == cuda_semantic["rankings"]
    max_score_difference = max(differences, default=0.0)
    return {
        "sameRankings": same_rankings,
        "maxScoreDifference": round(max_score_difference, 9),
        "equivalent": same_rankings and max_score_difference <= 0.001,
    }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Benchmark CPU/CUDA CLIP sidecar inference on a read-only representative corpus")
    result.add_argument("--corpus", type=Path, required=True)
    result.add_argument("--model", default=os.getenv("LOCAL_EMBEDDING_MODEL", "sentence-transformers/clip-ViT-B-32"))
    result.add_argument("--limit", type=int, default=12)
    result.add_argument("--repeats", type=int, default=3)
    result.add_argument("--batch-size", type=int, default=int(os.getenv("MEDIA_AI_EMBED_BATCH_SIZE", "16")))
    result.add_argument("--gpu-memory-limit-mib", type=int, default=int(os.getenv("MEDIA_AI_GPU_MEMORY_LIMIT_MB", "4096")))
    result.add_argument("--allow-download", action="store_true")
    return result


def main() -> None:
    args = parser().parse_args()
    if not args.corpus.is_dir():
        raise SystemExit("Benchmark corpus must be an existing directory.")
    if args.limit < 1 or args.limit > 64:
        raise SystemExit("--limit must be from 1 through 64.")
    if args.repeats < 3 or args.repeats > 20:
        raise SystemExit("--repeats must be from 3 through 20.")
    if args.batch_size < 1 or args.batch_size > 64:
        raise SystemExit("--batch-size must be from 1 through 64.")
    paths = list(iter_media(args.corpus.resolve()))[: args.limit]
    if not paths:
        raise SystemExit("Benchmark corpus contains no supported media.")

    import torch

    torch.set_num_threads(max(1, min(8, os.cpu_count() or 1)))
    cuda_probe = probe_cuda(0)
    images = _load_images(paths)
    try:
        cpu = _run_backend(args.model, "cpu", images, args.repeats, args.batch_size, not args.allow_download)
        cuda = None
        gpu_peak_mib = None
        if cuda_probe.cuda_available:
            if not cuda_probe.total_memory_mib:
                raise RuntimeError("CUDA total memory is unavailable.")
            limit_mib = min(args.gpu_memory_limit_mib, max(256, int(cuda_probe.total_memory_mib * 0.90)))
            torch.cuda.set_device(cuda_probe.device_index)
            torch.cuda.memory.set_per_process_memory_fraction(limit_mib / cuda_probe.total_memory_mib, cuda_probe.device_index)
            torch.cuda.reset_peak_memory_stats(cuda_probe.device_index)
            cuda = _run_backend(args.model, f"cuda:{cuda_probe.device_index}", images, args.repeats, args.batch_size, not args.allow_download)
            gpu_peak_mib = round(torch.cuda.max_memory_reserved(cuda_probe.device_index) / (1024 * 1024))
            torch.cuda.empty_cache()

        output = {
            "schemaVersion": 1,
            "model": args.model,
            "corpus": {"items": len(paths), "totalBytes": sum(path.stat().st_size for path in paths)},
            "repeats": args.repeats,
            "batchSize": args.batch_size,
            "torchVersion": str(torch.__version__),
            "cudaVersion": str(torch.version.cuda) if torch.version.cuda else None,
            "cudaProbe": {
                "available": cuda_probe.cuda_available,
                "deviceName": cuda_probe.device_name,
                "totalMemoryMiB": cuda_probe.total_memory_mib,
            },
            "cpu": {key: value for key, value in cpu.items() if key != "semantic"},
            "cuda": {**{key: value for key, value in cuda.items() if key != "semantic"}, "peakReservedMiB": gpu_peak_mib} if cuda else None,
            "equivalence": _equivalence(cpu, cuda) if cuda else None,
        }
        print(f"SIDECAR_ACCELERATOR_BENCHMARK={json.dumps(output, separators=(',', ':'))}")
    finally:
        for image in images:
            image.close()


if __name__ == "__main__":
    main()
