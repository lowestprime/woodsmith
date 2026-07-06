from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Any, Iterable

from .cache import SidecarCache
from .schemas import now_iso

SUPPORTED_IMAGES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".heif"}
IGNORED_PARTS = {"@eadir", "__macosx", ".git", ".svn", "thumbnails", ".thumbnails"}
IGNORED_FILES = {"synoindex_media_info", ".ds_store", "thumbs.db", "desktop.ini"}


def is_supported(path: Path) -> bool:
    lowered_parts = {part.lower() for part in path.parts}
    name = path.name.lower()
    return (
        path.suffix.lower() in SUPPORTED_IMAGES
        and not lowered_parts.intersection(IGNORED_PARTS)
        and name not in IGNORED_FILES
        and not name.startswith("._")
        and not any(part.startswith(".") for part in path.parts)
    )


def iter_media(root: Path) -> Iterable[Path]:
    for directory, names, files in os.walk(root):
        names[:] = sorted(name for name in names if name.lower() not in IGNORED_PARTS and not name.startswith("."))
        base = Path(directory)
        for name in sorted(files):
            candidate = base / name
            if is_supported(candidate.relative_to(root)):
                yield candidate


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while block := handle.read(1024 * 1024):
            digest.update(block)
    return digest.hexdigest()


def image_facts(path: Path) -> tuple[str | None, int | None, int | None, str | None]:
    try:
        from PIL import Image
        import imagehash
        with Image.open(path) as image:
            width, height = image.size
            perceptual = str(imagehash.phash(image.convert("RGB")))
            thumbnail_error = None
        return perceptual, width, height, thumbnail_error
    except Exception as error:  # Optional image dependencies or unsupported camera formats.
        return None, None, None, str(error)


def safe_media_path(root: Path, relative_path: str) -> Path:
    normalized = relative_path.replace("\\", "/").lstrip("/")
    candidate = (root / normalized).resolve()
    resolved_root = root.resolve()
    if candidate != resolved_root and resolved_root not in candidate.parents:
        raise ValueError("Media path escapes the configured media root.")
    if not candidate.is_file() or not is_supported(candidate.relative_to(resolved_root)):
        raise FileNotFoundError(f"Unsupported or missing media path: {relative_path}")
    return candidate


def index_file(root: Path, path: Path, cache: SidecarCache, dry_run: bool = False) -> dict[str, Any]:
    relative_path = path.relative_to(root).as_posix()
    stat = path.stat()
    existing = cache.get_file(relative_path)
    if existing and int(existing["size_bytes"]) == stat.st_size and int(existing["mtime_ns"]) == stat.st_mtime_ns:
        return {
            "relativePath": relative_path,
            "sizeBytes": stat.st_size,
            "mtimeNs": stat.st_mtime_ns,
            "sha256": existing["sha256"],
            "perceptualHash": existing["perceptual_hash"],
            "width": existing["width"],
            "height": existing["height"],
            "cached": True,
        }
    perceptual, width, height, image_error = image_facts(path)
    record = {
        "relativePath": relative_path,
        "sizeBytes": stat.st_size,
        "mtimeNs": stat.st_mtime_ns,
        "sha256": sha256_file(path),
        "perceptualHash": perceptual,
        "width": width,
        "height": height,
        "updatedAt": now_iso(),
    }
    if not dry_run:
        cache.put_file(record)
    return {**record, "cached": False, **({"warning": image_error} if image_error else {})}


def scan(root: Path, cache: SidecarCache, selected_paths: list[str] | None, limit: int, dry_run: bool) -> dict[str, Any]:
    paths = [safe_media_path(root, value) for value in selected_paths] if selected_paths else list(iter_media(root))
    items, errors = [], []
    for path in paths[:limit]:
        try:
            items.append(index_file(root, path, cache, dry_run))
        except Exception as error:
            errors.append({"path": str(path), "message": str(error)})
    return {"items": items, "scanned": len(items), "remaining": max(0, len(paths) - len(items)), "errors": errors, "dryRun": dry_run}
