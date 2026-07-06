from __future__ import annotations

import base64
import json
import mimetypes
import os
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from .schemas import ANALYSIS_SCHEMA, normalize_analysis


def configured() -> bool:
    return bool(os.getenv("GEMINI_API_KEY")) and os.getenv("ENABLE_GEMINI_FALLBACK", "false").lower() in {"1", "true"}


def analyze(path: Path, candidate_pieces: list[dict[str, str]]) -> dict[str, Any]:
    key = os.environ["GEMINI_API_KEY"]
    model = os.getenv("GEMINI_VISION_MODEL", "gemini-3.1-flash-lite")
    candidates = "\n".join(f"- {item.get('slug')}: {item.get('title')}. {item.get('description')}" for item in candidate_pieces)
    prompt = "Analyze this woodworking catalog image using only visible evidence. Never force a piece match. Return schema-valid JSON."
    if candidates:
        prompt += f"\nKnown candidates:\n{candidates}"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}, {"inlineData": {"mimeType": mimetypes.guess_type(path.name)[0] or "image/jpeg", "data": base64.b64encode(path.read_bytes()).decode("ascii")}}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": ANALYSIS_SCHEMA},
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={urllib.parse.quote(key)}"
    request = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=float(os.getenv("MEDIA_AI_GEMINI_TIMEOUT", "90"))) as response:
        result = json.load(response)
    content = "".join(part.get("text", "") for part in result.get("candidates", [{}])[0].get("content", {}).get("parts", []))
    return normalize_analysis(json.loads(content), "gemini", str(result.get("modelVersion") or model))
