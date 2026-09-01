from __future__ import annotations

import argparse
import hmac
import ipaddress
import json
import os
import platform
import sys
import threading
import time
from contextlib import nullcontext
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from . import __version__
from .accelerator import GpuLeaseBusyError, resolve_accelerator
from .cache import SidecarCache
from .cluster import cluster_items
from .embeddings import cosine, embed_paths, embed_texts, model_key, runtime_status
from .indexer import cached_thumbnail_current, index_file, iter_media, safe_media_path, scan
from .ollama_client import analyze as ollama_analyze, configured as ollama_configured, health as ollama_health
from .gemini_client import analyze as gemini_analyze, configured as gemini_configured
from .schemas import normalize_analysis, now_iso

FURNITURE_LABELS = [
    "entry table", "side table", "dining table", "writing desk", "desk", "cabinet",
    "bench", "pantry cabinet", "hutch", "outdoor bench", "tray", "stool", "rack",
    "footstool", "woodworking part detail", "workshop process", "room context", "drawing plan",
]


def _truthy(value: Any) -> bool:
    return str(value or "").lower() in {"1", "true", "yes", "on"}


def _bounded_limit(body: dict[str, Any], default: int) -> int:
    try:
        return max(1, min(default, int(body.get("limit") or default)))
    except (TypeError, ValueError):
        return default


class MediaAiService:
    def __init__(self, media_root: Path, cache_path: Path, model_name: str, max_batch: int) -> None:
        self.media_root = media_root.resolve()
        self.cache = SidecarCache(cache_path)
        self.model_name = model_name
        self.max_batch = max(1, min(100, max_batch))
        self.accelerator = resolve_accelerator(cache_path)
        self.work_lock = threading.Lock()
        self.status_lock = threading.RLock()
        self.active_action: str | None = None
        self.active_since: str | None = None
        self.last_action: str | None = None
        self.last_completed_at: str | None = None
        self.last_duration_ms: int | None = None
        self.last_outcome: str | None = None

    def _work_status(self) -> dict[str, Any]:
        with self.status_lock:
            return {
                "busy": self.active_action is not None,
                "activeAction": self.active_action,
                "activeSince": self.active_since,
                "lastAction": self.last_action,
                "lastCompletedAt": self.last_completed_at,
                "lastDurationMs": self.last_duration_ms,
                "lastOutcome": self.last_outcome,
                "restartBehavior": "Active work stops on process exit; cached file, embedding, analysis, and cluster records make the next bounded request resumable.",
            }

    def _begin_work(self, action: str) -> float:
        started = time.monotonic()
        with self.status_lock:
            self.active_action = action
            self.active_since = now_iso()
        return started

    def _finish_work(self, action: str, started: float, outcome: str) -> None:
        with self.status_lock:
            self.active_action = None
            self.active_since = None
            self.last_action = action
            self.last_completed_at = now_iso()
            self.last_duration_ms = round((time.monotonic() - started) * 1000)
            self.last_outcome = outcome

    def _all_relative_paths(self) -> list[str]:
        return [path.relative_to(self.media_root).as_posix() for path in iter_media(self.media_root)]

    def _pending_full_paths(self) -> list[str]:
        pending = []
        for relative_path in self._all_relative_paths():
            path = safe_media_path(self.media_root, relative_path)
            stat = path.stat()
            cached = self.cache.get_file(relative_path)
            current = cached and int(cached["size_bytes"]) == stat.st_size and int(cached["mtime_ns"]) == stat.st_mtime_ns and cached_thumbnail_current(self.cache, cached)
            file_hash = str(cached["sha256"]) if current else None
            if not current or not self.cache.has_embedding(relative_path, self.model_name, file_hash) or not self.cache.has_analysis(relative_path, file_hash):
                pending.append(relative_path)
        return pending

    def _pending_analysis_paths(self) -> list[str]:
        pending = []
        for relative_path in self._all_relative_paths():
            path = safe_media_path(self.media_root, relative_path)
            stat = path.stat()
            cached = self.cache.get_file(relative_path)
            current = cached and int(cached["size_bytes"]) == stat.st_size and int(cached["mtime_ns"]) == stat.st_mtime_ns
            file_hash = str(cached["sha256"]) if current else None
            if not current or not self.cache.has_analysis(relative_path, file_hash):
                pending.append(relative_path)
        return pending

    def health(self) -> dict[str, Any]:
        embedding = runtime_status(self.model_name, self.accelerator)
        return {
            "ok": True,
            "service": "beaman-media-ai-sidecar",
            "version": __version__,
            "python": platform.python_version(),
            "mediaRoot": str(self.media_root),
            "mediaRootReadable": self.media_root.is_dir(),
            "model": self.model_name,
            "embedding": embedding,
            "ollama": ollama_health(),
            "geminiFallbackConfigured": gemini_configured(),
            "cache": self.cache.summary(),
            "queue": self.cache.queue_summary(self.model_name, model_key(self.model_name)),
            "work": self._work_status(),
            "maxBatch": self.max_batch,
        }

    def scan(self, body: dict[str, Any]) -> dict[str, Any]:
        selected = [str(item) for item in body.get("selectedPaths", [])] if isinstance(body.get("selectedPaths"), list) else None
        return {"ok": True, "action": "scan", **scan(self.media_root, self.cache, selected, _bounded_limit(body, self.max_batch), _truthy(body.get("dryRun")))}

    def embed(self, body: dict[str, Any]) -> dict[str, Any]:
        started = time.monotonic()
        texts = [str(item) for item in body.get("texts", [])] if isinstance(body.get("texts"), list) else []
        selected = [str(item) for item in body.get("selectedPaths", [])] if isinstance(body.get("selectedPaths"), list) else []
        limit = _bounded_limit(body, self.max_batch)
        dry_run = _truthy(body.get("dryRun"))
        response: dict[str, Any] = {"ok": True, "action": "embed", "provider": "local-sidecar", "model": self.model_name, "version": "1", "dryRun": dry_run}
        if texts:
            response["embeddings"] = embed_texts(texts[:limit], self.model_name, self.accelerator)
        if selected:
            response["items"] = embed_paths(
                self.media_root,
                self.cache,
                selected[:limit],
                self.model_name,
                dry_run,
                self.accelerator,
            )
        response["durationMs"] = round((time.monotonic() - started) * 1000)
        return response

    def _local_analysis(self, relative_path: str, pieces: list[dict[str, str]], dry_run: bool) -> dict[str, Any]:
        path = safe_media_path(self.media_root, relative_path)
        facts = index_file(self.media_root, path, self.cache, dry_run)
        item_embedding = embed_paths(
            self.media_root,
            self.cache,
            [relative_path],
            self.model_name,
            dry_run,
            self.accelerator,
        )[0]
        if not item_embedding.get("embedding"):
            raise RuntimeError(item_embedding.get("error") or "Local image embedding unavailable.")
        label_vectors = embed_texts(
            [f"a photograph of a {label} made from wood" for label in FURNITURE_LABELS],
            self.model_name,
            self.accelerator,
        )
        ranked_labels = sorted(
            [(label, max(0.0, cosine(item_embedding["embedding"], vector))) for label, vector in zip(FURNITURE_LABELS, label_vectors, strict=True)],
            key=lambda pair: pair[1], reverse=True,
        )
        best_label, best_score = ranked_labels[0]
        runner_score = ranked_labels[1][1] if len(ranked_labels) > 1 else 0.0
        piece_candidates = []
        if pieces:
            piece_vectors = embed_texts(
                [f"a photograph of {piece.get('title')}. {piece.get('description')}" for piece in pieces],
                self.model_name,
                self.accelerator,
            )
            for piece, vector in sorted(zip(pieces, piece_vectors, strict=True), key=lambda pair: cosine(item_embedding["embedding"], pair[1]), reverse=True)[:5]:
                similarity = max(0.0, cosine(item_embedding["embedding"], vector))
                if similarity >= 0.18:
                    piece_candidates.append({"slug": piece.get("slug", ""), "confidence": round(similarity, 5), "evidence": ["local shared-space image/text similarity"]})
        context_label = best_label in {"workshop process", "room context", "drawing plan", "woodworking part detail"}
        furniture_class = best_label if best_label in FURNITURE_LABELS[:14] else "other"
        primary_object = "furniture-piece"
        photo_context = "unknown"
        if best_label == "workshop process":
            primary_object, photo_context = "process-workshop", "process-shot"
        elif best_label == "room context":
            primary_object, photo_context = "room-context", "property-context"
        elif best_label == "drawing plan":
            primary_object, photo_context = "drawing-plan", "plan-sketch"
        elif best_label == "woodworking part detail":
            primary_object, photo_context = "part-detail", "detail-closeup"
        ambiguity = max(0.0, min(1.0, 1.0 - max(0.0, best_score - runner_score) * 4))
        confidence = max(0.0, min(1.0, best_score))
        raw = {
            "primaryObject": primary_object,
            "furnitureClass": furniture_class,
            "specificSubtype": best_label if not context_label else "",
            "photoContext": photo_context,
            "constructionStage": "unknown",
            "visibleFeatures": [],
            "woodSpecies": [],
            "finishDescription": "",
            "joinery": "not visible",
            "hardware": [],
            "shapeAndProportionNotes": f"Source image is {facts.get('width') or 'unknown'} by {facts.get('height') or 'unknown'} pixels.",
            "candidatePieceSlugs": piece_candidates,
            "searchTags": [best_label, primary_object, photo_context, "local-image-analysis"],
            "description": f"Woodworking image classified locally as {best_label}.",
            "altTextDraft": f"{best_label.capitalize()} woodworking photograph",
            "confidence": confidence,
            "ambiguity": ambiguity,
            "uncertainty": ["Wood species, finish, joinery, and exact piece identity require visual verification."],
            "unsafeToAutoAssignReason": "Local zero-shot classification is a review aid, not identity proof." if confidence < 0.82 or ambiguity >= 0.28 or context_label else "",
        }
        return normalize_analysis(raw, "local-clip", self.model_name)

    def analyze(self, body: dict[str, Any]) -> dict[str, Any]:
        started = time.monotonic()
        selected = [str(item) for item in body.get("selectedPaths", [])] if isinstance(body.get("selectedPaths"), list) else []
        if not selected:
            selected = self._pending_analysis_paths()
        pieces = [item for item in body.get("pieces", []) if isinstance(item, dict)] if isinstance(body.get("pieces"), list) else []
        dry_run = _truthy(body.get("dryRun"))
        items, errors = [], []
        for relative_path in selected[:_bounded_limit(body, self.max_batch)]:
            try:
                path = safe_media_path(self.media_root, relative_path)
                facts = index_file(self.media_root, path, self.cache, dry_run)
                cached = None if _truthy(body.get("forceVision")) else self.cache.get_latest_analysis(relative_path, str(facts["sha256"]))
                if cached:
                    analysis = cached["analysis"]
                    items.append({"relativePath": relative_path, "analysis": analysis, "provider": cached["provider"], "model": cached["model"], "hash": facts["sha256"], "cached": True})
                    continue
                analysis = self._local_analysis(relative_path, pieces, dry_run)
                provider, model = "local-clip", self.model_name
                should_arbitrate = analysis["confidence"] < 0.78 or analysis["ambiguity"] >= 0.3 or _truthy(body.get("forceVision"))
                if should_arbitrate and ollama_configured() and ollama_health().get("available"):
                    analysis = ollama_analyze(path, pieces)
                    provider, model = "ollama", str(analysis.get("model") or os.getenv("OLLAMA_VISION_MODEL", "gemma4"))
                elif should_arbitrate and gemini_configured():
                    analysis = gemini_analyze(path, pieces)
                    provider, model = "gemini", str(analysis.get("model") or os.getenv("GEMINI_VISION_MODEL", "gemini-3.1-flash-lite"))
                cache_key = f"{provider}:{model}:{facts['sha256']}:woodsmith-media-v1"
                if not dry_run:
                    self.cache.put_analysis({"cacheKey": cache_key, "relativePath": relative_path, "fileHash": facts["sha256"], "provider": provider, "model": model, "analysisJson": json.dumps(analysis), "analyzedAt": analysis["analyzedAt"]})
                items.append({"relativePath": relative_path, "analysis": analysis, "provider": provider, "model": model, "hash": facts["sha256"], "cached": False})
            except Exception as error:
                errors.append({"path": relative_path, "message": str(error)})
        return {"ok": True, "action": "analyze", "items": items, "analyzed": len(items), "errors": errors, "dryRun": dry_run, "durationMs": round((time.monotonic() - started) * 1000)}

    def cluster(self, body: dict[str, Any]) -> dict[str, Any]:
        started = time.monotonic()
        selected = [str(item) for item in body.get("selectedPaths", [])] if isinstance(body.get("selectedPaths"), list) else [path.relative_to(self.media_root).as_posix() for path in iter_media(self.media_root)]
        selected = selected[:_bounded_limit(body, self.max_batch)]
        dry_run = _truthy(body.get("dryRun"))
        embedded = embed_paths(
            self.media_root,
            self.cache,
            selected,
            self.model_name,
            dry_run,
            self.accelerator,
        )
        enriched = []
        for item in embedded:
            if not item.get("embedding"):
                continue
            facts = self.cache.get_file(item["relativePath"]) or {}
            enriched.append({**item, "perceptualHash": facts.get("perceptual_hash"), "width": facts.get("width"), "height": facts.get("height"), "sizeBytes": facts.get("size_bytes")})
        clusters = cluster_items(enriched, model_key(self.model_name), float(os.getenv("MEDIA_AI_CLUSTER_SIMILARITY", "0.84")), int(os.getenv("MEDIA_AI_DUPLICATE_HASH_DISTANCE", "8")))
        if not dry_run:
            self.cache.replace_clusters(clusters, model_key(self.model_name), now_iso(), selected)
        return {"ok": True, "action": "cluster", "items": clusters, "clusters": len({item['clusterId'] for item in clusters}), "members": len(clusters), "errors": [item for item in embedded if item.get("error")], "dryRun": dry_run, "durationMs": round((time.monotonic() - started) * 1000)}

    def rank(self, body: dict[str, Any]) -> dict[str, Any]:
        started = time.monotonic()
        pieces = [item for item in body.get("pieces", []) if isinstance(item, dict)] if isinstance(body.get("pieces"), list) else []
        selected = [str(item) for item in body.get("selectedPaths", [])] if isinstance(body.get("selectedPaths"), list) else [path.relative_to(self.media_root).as_posix() for path in iter_media(self.media_root)]
        selected = selected[:_bounded_limit(body, self.max_batch)]
        dry_run = _truthy(body.get("dryRun"))
        media_items = embed_paths(
            self.media_root,
            self.cache,
            selected,
            self.model_name,
            dry_run,
            self.accelerator,
        )
        piece_vectors = embed_texts(
            [f"a photograph of {piece.get('title')}. {piece.get('description')}" for piece in pieces],
            self.model_name,
            self.accelerator,
        ) if pieces else []
        matches = []
        for media in media_items:
            if not media.get("embedding"):
                continue
            ranked = sorted(((piece, max(0.0, cosine(media["embedding"], vector))) for piece, vector in zip(pieces, piece_vectors, strict=True)), key=lambda pair: pair[1], reverse=True)
            for index, (piece, similarity) in enumerate(ranked[:3]):
                matches.append({"mediaPath": media["relativePath"], "pieceSlug": piece.get("slug"), "visualSimilarity": round(similarity, 6), "rank": index + 1, "evidence": ["local CLIP image/text similarity"]})
        return {"ok": True, "action": "rank", "matches": matches, "count": len(matches), "errors": [item for item in media_items if item.get("error")], "dryRun": dry_run, "durationMs": round((time.monotonic() - started) * 1000)}

    def full(self, body: dict[str, Any]) -> dict[str, Any]:
        requested = [str(item) for item in body.get("selectedPaths", [])] if isinstance(body.get("selectedPaths"), list) else []
        pending = [] if requested else self._pending_full_paths()
        selected = (requested or pending)[:_bounded_limit(body, self.max_batch)]
        scoped = {**body, "selectedPaths": selected}
        result = {"ok": True, "action": "full", "scan": self.scan(scoped), "embeddings": self.embed(scoped), "analysis": self.analyze(scoped), "clusters": self.cluster(scoped), "matches": self.rank(scoped)}
        if not requested:
            result["remaining"] = max(0, len(pending) - len(selected))
            result["nextRecommendedAction"] = "Run Full again to continue the next uncached batch." if result["remaining"] else "Local embedding and analysis caches are current."
        return result

    def dispatch(self, action: str, body: dict[str, Any]) -> dict[str, Any]:
        if action == "cancel":
            work = self._work_status()
            return {
                "ok": True,
                "action": "cancel",
                "cancelled": False,
                "reason": "Runs are synchronous; the active bounded request cannot be interrupted safely.",
                "work": work,
            }
        actions = {"scan": self.scan, "embed": self.embed, "analyze": self.analyze, "cluster": self.cluster, "rank": self.rank, "full": self.full}
        handler = actions.get(action)
        if handler is None:
            raise ValueError(f"Unsupported action: {action}")
        if not self.work_lock.acquire(blocking=False):
            return {
                "ok": False,
                "action": action,
                "busy": True,
                "error": "Another media AI batch is already running.",
                "work": self._work_status(),
            }
        started = self._begin_work(action)
        try:
            lease = self.accelerator.lease(action) if action != "scan" else nullcontext()
            with lease:
                response = handler(body)
            response["accelerator"] = self.accelerator.operation_status()
            self._finish_work(action, started, "completed")
            return response
        except GpuLeaseBusyError:
            self._finish_work(action, started, "gpu-busy")
            return {
                "ok": False,
                "action": action,
                "busy": True,
                "error": "The shared GPU workload lease is already held.",
                "accelerator": self.accelerator.operation_status(),
                "work": self._work_status(),
            }
        except Exception:
            self._finish_work(action, started, "failed")
            raise
        finally:
            self.work_lock.release()


def token_matches(expected: str | None, authorization: str | None) -> bool:
    if not expected:
        return True
    prefix = "Bearer "
    if not authorization or not authorization.startswith(prefix):
        return False
    return hmac.compare_digest(expected.encode("utf-8"), authorization[len(prefix):].encode("utf-8"))


def loopback_host(host: str) -> bool:
    if host.strip().lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def make_handler(service: MediaAiService, token: str | None):
    class Handler(BaseHTTPRequestHandler):
        server_version = "BeamanMediaAI/1.0"

        def _json(self, status: int, payload: dict[str, Any]) -> None:
            encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(encoded)

        def _authorized(self) -> bool:
            return token_matches(token, self.headers.get("Authorization"))

        def do_GET(self) -> None:  # noqa: N802
            if self.path.rstrip("/") != "/health":
                self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"})
                return
            if not self._authorized():
                self._json(HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "Unauthorized"})
                return
            self._json(HTTPStatus.OK, service.health())

        def do_POST(self) -> None:  # noqa: N802
            if not self._authorized():
                self._json(HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "Unauthorized"})
                return
            action = self.path.strip("/")
            try:
                length = max(0, min(int(self.headers.get("Content-Length", "0")), 2_000_000))
                body = json.loads(self.rfile.read(length) or b"{}")
                if not isinstance(body, dict):
                    raise ValueError("Request JSON must be an object.")
                self._json(HTTPStatus.OK, service.dispatch(action, body))
            except ValueError as error:
                self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "action": action, "error": str(error)})
            except Exception as error:
                self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "action": action, "error": str(error)})

        def log_message(self, message: str, *args: Any) -> None:
            sys.stderr.write(f"[{self.log_date_time_string()}] {message % args}\n")

    return Handler


def serve(host: str, port: int, media_root: Path, cache_path: Path, model_name: str, max_batch: int, token: str | None) -> None:
    if not token and not loopback_host(host):
        raise SystemExit("MEDIA_AI_SIDECAR_TOKEN is required when binding beyond loopback.")
    if not media_root.is_dir():
        raise SystemExit(f"Media root does not exist or is not a directory: {media_root}")
    service = MediaAiService(media_root, cache_path, model_name, max_batch)
    server = ThreadingHTTPServer((host, port), make_handler(service, token))
    print(f"Beaman media AI sidecar listening on http://{host}:{port} for {media_root}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        service.cache.connection.close()


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="Local-first media analysis sidecar for Beaman Woodworks")
    result.add_argument("--host", default=os.getenv("MEDIA_AI_HOST", "127.0.0.1"))
    result.add_argument("--port", type=int, default=int(os.getenv("MEDIA_AI_PORT", "8765")))
    result.add_argument("--media-root", type=Path, default=Path(os.getenv("MEDIA_AI_MEDIA_ROOT", ".")))
    result.add_argument("--cache", type=Path, default=Path(os.getenv("MEDIA_AI_CACHE", Path.home() / ".cache" / "beaman-media-ai" / "cache.sqlite")))
    result.add_argument("--model", default=os.getenv("LOCAL_EMBEDDING_MODEL", "sentence-transformers/clip-ViT-B-32"))
    result.add_argument("--max-batch", type=int, default=int(os.getenv("MEDIA_AI_MAX_BATCH", "24")))
    return result
