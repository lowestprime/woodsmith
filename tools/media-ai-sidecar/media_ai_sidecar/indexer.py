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


def image_facts(path: Path, thumbnail_path: Path | None = None) -> tuple[str | None, int | None, int | None, bool, str | None]:
    try:
        from PIL import Image, ImageOps
        with Image.open(path) as image:
            oriented = ImageOps.exif_transpose(image)
            width, height = oriented.size
            rgb = oriented.convert("RGB")
            if thumbnail_path is not None and not thumbnail_path.is_file():
                thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
                thumbnail = rgb.copy()
                thumbnail.thumbnail((768, 768), Image.Resampling.LANCZOS)
                temporary = thumbnail_path.with_suffix(".tmp")
                thumbnail.save(temporary, format="JPEG", quality=88, optimize=True)
                os.replace(temporary, thumbnail_path)
            thumbnail_available = thumbnail_path is not None and thumbnail_path.is_file()
            try:
                import imagehash
                perceptual = str(imagehash.phash(rgb))
                warning = None
            except Exception as error:
                perceptual = None
                warning = f"Perceptual hash unavailable: {error}"
        return perceptual, width, height, thumbnail_available, warning
    except Exception as error:  # Optional image dependencies or unsupported camera formats.
        return None, None, None, False, str(error)


def cached_thumbnail_current(cache: SidecarCache, existing: dict[str, Any] | None) -> bool:
    if not existing:
        return False
    reference = existing.get("thumbnail_path")
    if reference == "":
        return True
    if not isinstance(reference, str) or not reference:
        return False
    thumbnail = cache.resolve_thumbnail(reference)
    return thumbnail is not None and thumbnail.is_file()


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
    current = existing and int(existing["size_bytes"]) == stat.st_size and int(existing["mtime_ns"]) == stat.st_mtime_ns
    if current and cached_thumbnail_current(cache, existing):
        return {
            "relativePath": relative_path,
            "sizeBytes": stat.st_size,
            "mtimeNs": stat.st_mtime_ns,
            "sha256": existing["sha256"],
            "perceptualHash": existing["perceptual_hash"],
            "width": existing["width"],
            "height": existing["height"],
            "thumbnailPath": existing["thumbnail_path"],
            "cached": True,
        }
    file_hash = str(existing["sha256"]) if current else sha256_file(path)
    thumbnail_target, thumbnail_relative = cache.thumbnail_target(file_hash)
    perceptual, width, height, thumbnail_available, image_warning = image_facts(path, None if dry_run else thumbnail_target)
    record = {
        "relativePath": relative_path,
        "sizeBytes": stat.st_size,
        "mtimeNs": stat.st_mtime_ns,
        "sha256": file_hash,
        "perceptualHash": perceptual,
        "width": width,
        "height": height,
        # Empty string records an attempted but unavailable thumbnail; NULL is reserved for legacy/unattempted rows.
        "thumbnailPath": thumbnail_relative if thumbnail_available and not dry_run else (None if dry_run else ""),
        "updatedAt": now_iso(),
    }
    if not dry_run:
        cache.put_file(record)
    return {**record, "cached": False, **({"warning": image_warning} if image_warning else {})}


def scan(root: Path, cache: SidecarCache, selected_paths: list[str] | None, limit: int, dry_run: bool) -> dict[str, Any]:
    paths: list[Path] = []
    errors: list[dict[str, str]] = []
    if selected_paths:
        for value in selected_paths:
            try:
                paths.append(safe_media_path(root, value))
            except Exception as error:
                errors.append({"path": value, "message": str(error)})
    else:
        paths = list(iter_media(root))
    pending = []
    for path in paths:
        try:
            relative_path = path.relative_to(root).as_posix()
            existing = cache.get_file(relative_path)
            stat = path.stat()
            if not existing or int(existing["size_bytes"]) != stat.st_size or int(existing["mtime_ns"]) != stat.st_mtime_ns or not cached_thumbnail_current(cache, existing):
                pending.append(path)
        except Exception as error:
            errors.append({"path": str(path), "message": str(error)})
    items = []
    for path in pending[:limit]:
        try:
            items.append(index_file(root, path, cache, dry_run))
        except Exception as error:
            errors.append({"path": str(path), "message": str(error)})
    remaining = max(0, len(pending) - len(items))
    return {
        "items": items,
        "scanned": len(items),
        "total": len(paths),
        "upToDate": len(paths) - len(pending),
        "remaining": remaining,
        "errors": errors,
        "dryRun": dry_run,
        "nextRecommendedAction": "Run Scan again to continue the remaining changed files." if remaining else "Index is current; continue with Embed or Analyze.",
    }
