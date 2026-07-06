from __future__ import annotations

import hashlib
import importlib.util
import importlib.metadata
import json
import threading
from pathlib import Path
from typing import Any

from .cache import SidecarCache
from .indexer import index_file, safe_media_path
from .schemas import now_iso

_MODEL = None
_MODEL_LOCK = threading.Lock()


def model_key(model_name: str) -> str:
    return f"sentence-transformers:{model_name}:1"


def runtime_status(model_name: str) -> dict[str, Any]:
    try:
        if importlib.util.find_spec("sentence_transformers") is None:
            raise ImportError("sentence-transformers is not installed; install the sidecar ai extra.")
        return {"available": True, "model": model_name, "libraryVersion": importlib.metadata.version("sentence-transformers"), "device": "auto (CUDA when available, otherwise CPU)"}
    except Exception as error:
        return {"available": False, "model": model_name, "reason": str(error), "device": "unavailable"}


def get_model(model_name: str):
    global _MODEL
    with _MODEL_LOCK:
        if _MODEL is None:
            from sentence_transformers import SentenceTransformer
            _MODEL = SentenceTransformer(model_name)
        return _MODEL


def normalize_vector(value: Any) -> list[float]:
    if hasattr(value, "tolist"):
        value = value.tolist()
    vector = [float(item) for item in value]
    magnitude = sum(item * item for item in vector) ** 0.5
    return [item / magnitude for item in vector] if magnitude else vector


def embed_texts(texts: list[str], model_name: str) -> list[list[float]]:
    if not texts:
        return []
    vectors = get_model(model_name).encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return [normalize_vector(value) for value in vectors]


def embed_paths(root: Path, cache: SidecarCache, relative_paths: list[str], model_name: str, dry_run: bool) -> list[dict[str, Any]]:
    from PIL import Image, ImageOps
    key_prefix = model_key(model_name)
    results: list[dict[str, Any]] = []
    pending: list[tuple[str, Path, dict[str, Any], str]] = []
    for relative_path in relative_paths:
        try:
            path = safe_media_path(root, relative_path)
            facts = index_file(root, path, cache, dry_run)
            cache_key = f"{key_prefix}:{facts['sha256']}"
            cached = cache.get_embedding(cache_key)
            if cached:
                results.append({"relativePath": relative_path, "embedding": cached["embedding"], "provider": "local-sidecar", "model": model_name, "version": "1", "hash": facts["sha256"], "computedAt": cached["computed_at"], "cached": True})
            else:
                pending.append((relative_path, path, facts, cache_key))
        except Exception as error:
            results.append({"relativePath": relative_path, "provider": "local-sidecar", "model": model_name, "version": "1", "error": str(error)})
    if pending:
        images = []
        try:
            for _, path, facts, _ in pending:
                thumbnail = cache.resolve_thumbnail(str(facts.get("thumbnailPath") or ""))
                source = thumbnail if thumbnail is not None and thumbnail.is_file() else path
                with Image.open(source) as image:
                    images.append(ImageOps.exif_transpose(image).convert("RGB").copy())
            vectors = get_model(model_name).encode(images, normalize_embeddings=True, show_progress_bar=False)
            for (relative_path, _, facts, cache_key), vector in zip(pending, vectors, strict=True):
                normalized = normalize_vector(vector)
                computed_at = now_iso()
                if not dry_run:
                    cache.put_embedding({"cacheKey": cache_key, "relativePath": relative_path, "fileHash": facts["sha256"], "provider": "local-sidecar", "model": model_name, "version": "1", "vectorJson": json.dumps(normalized), "computedAt": computed_at})
                results.append({"relativePath": relative_path, "embedding": normalized, "provider": "local-sidecar", "model": model_name, "version": "1", "hash": facts["sha256"], "computedAt": computed_at, "cached": False})
        except Exception as error:
            results.extend({"relativePath": relative_path, "provider": "local-sidecar", "model": model_name, "version": "1", "error": str(error)} for relative_path, _, _, _ in pending)
    order = {path: index for index, path in enumerate(relative_paths)}
    return sorted(results, key=lambda item: order.get(item["relativePath"], len(order)))


def cosine(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def stable_text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
