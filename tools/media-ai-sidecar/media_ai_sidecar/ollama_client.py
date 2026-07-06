from __future__ import annotations

import base64
import json
import os
import urllib.request
from pathlib import Path
from typing import Any

from .schemas import ANALYSIS_SCHEMA, normalize_analysis


def configured() -> bool:
    return os.getenv("MEDIA_AI_USE_OLLAMA", "false").lower() in {"1", "true"}


def health() -> dict[str, Any]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("OLLAMA_VISION_MODEL", "gemma4")
    if not configured():
        return {"configured": False, "available": False, "model": model, "reason": "MEDIA_AI_USE_OLLAMA is disabled."}
    try:
        with urllib.request.urlopen(f"{base_url}/api/tags", timeout=2.5) as response:
            payload = json.load(response)
        names = [str(item.get("name") or item.get("model") or "") for item in payload.get("models", [])]
        available = any(name.split(":")[0] == model.split(":")[0] for name in names)
        return {"configured": True, "available": available, "model": model, **({"reason": f"Model {model} is not installed."} if not available else {})}
    except Exception as error:
        return {"configured": True, "available": False, "model": model, "reason": str(error)}


def analyze(path: Path, candidate_pieces: list[dict[str, str]]) -> dict[str, Any]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("OLLAMA_VISION_MODEL", "gemma4")
    candidates = "\n".join(f"- {item.get('slug')}: {item.get('title')}. {item.get('description')}" for item in candidate_pieces)
    prompt = (
        "Analyze this woodworking catalog image. Return only JSON matching the supplied schema. "
        "Use only visible evidence; never force a known piece match. Candidate identity remains a human decision."
        + (f"\nKnown candidates:\n{candidates}" if candidates else "")
    )
    payload = {
        "model": model,
        "stream": False,
        "format": ANALYSIS_SCHEMA,
        "options": {"temperature": 0},
        "messages": [{"role": "user", "content": prompt, "images": [base64.b64encode(path.read_bytes()).decode("ascii")]}],
    }
    request = urllib.request.Request(f"{base_url}/api/chat", data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=float(os.getenv("MEDIA_AI_OLLAMA_TIMEOUT", "120"))) as response:
        result = json.load(response)
    raw = json.loads(result.get("message", {}).get("content", "{}"))
    return normalize_analysis(raw, "ollama", str(result.get("model") or model))
