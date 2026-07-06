from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

SCHEMA_VERSION = "woodsmith-media-v1"
PRIMARY_OBJECTS = {
    "furniture-piece", "part-detail", "room-context", "process-workshop",
    "drawing-plan", "hardware-detail", "people-context", "other",
}
FURNITURE_CLASSES = {
    "entry table", "side table", "dining table", "writing desk", "desk",
    "cabinet", "bench", "pantry cabinet", "hutch", "outdoor bench", "tray",
    "stool", "rack", "footstool", "other",
}
PHOTO_CONTEXTS = {
    "studio-shot", "workshop-photo", "in-situ", "detail-closeup", "process-shot",
    "plan-sketch", "property-context", "unknown",
}
CONSTRUCTION_STAGES = {
    "finished", "unfinished", "glue-up", "sanding", "assembly", "installation",
    "raw-material", "unknown",
}

ANALYSIS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "primaryObject": {"type": "string", "enum": sorted(PRIMARY_OBJECTS)},
        "furnitureClass": {"type": "string", "enum": sorted(FURNITURE_CLASSES)},
        "specificSubtype": {"type": "string"},
        "photoContext": {"type": "string", "enum": sorted(PHOTO_CONTEXTS)},
        "constructionStage": {"type": "string", "enum": sorted(CONSTRUCTION_STAGES)},
        "visibleFeatures": {"type": "array", "items": {"type": "string"}},
        "woodSpecies": {"type": "array", "items": {"type": "string"}},
        "finishDescription": {"type": "string"},
        "joinery": {"type": "string"},
        "hardware": {"type": "array", "items": {"type": "string"}},
        "shapeAndProportionNotes": {"type": "string"},
        "candidatePieceSlugs": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "slug": {"type": "string"},
                    "confidence": {"type": "number"},
                    "evidence": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["slug", "confidence", "evidence"],
            },
        },
        "searchTags": {"type": "array", "items": {"type": "string"}},
        "description": {"type": "string"},
        "altTextDraft": {"type": "string"},
        "confidence": {"type": "number"},
        "ambiguity": {"type": "number"},
        "uncertainty": {"type": "array", "items": {"type": "string"}},
        "unsafeToAutoAssignReason": {"type": "string"},
    },
    "required": [
        "primaryObject", "furnitureClass", "specificSubtype", "photoContext",
        "constructionStage", "visibleFeatures", "woodSpecies", "finishDescription",
        "joinery", "hardware", "shapeAndProportionNotes", "candidatePieceSlugs",
        "searchTags", "description", "altTextDraft", "confidence", "ambiguity",
        "uncertainty", "unsafeToAutoAssignReason",
    ],
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _text(value: Any, maximum: int = 800) -> str:
    return str(value or "").strip()[:maximum]


def _strings(value: Any, maximum: int = 32) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()][:maximum]


def _score(value: Any) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return 0.0


def normalize_analysis(raw: dict[str, Any], provider: str, model: str) -> dict[str, Any]:
    primary = _text(raw.get("primaryObject"), 80).lower()
    furniture = _text(raw.get("furnitureClass") or raw.get("pieceType"), 80).lower()
    context = _text(raw.get("photoContext"), 80).lower()
    stage = _text(raw.get("constructionStage"), 80).lower()
    confidence = _score(raw.get("confidence"))
    ambiguity = _score(raw.get("ambiguity"))
    primary = primary if primary in PRIMARY_OBJECTS else "other"
    furniture = furniture if furniture in FURNITURE_CLASSES else "other"
    context = context if context in PHOTO_CONTEXTS else "unknown"
    stage = stage if stage in CONSTRUCTION_STAGES else "unknown"
    unsafe = _text(raw.get("unsafeToAutoAssignReason"), 500)
    if not unsafe and primary != "furniture-piece":
        unsafe = "Image is not a complete furniture-piece view."
    elif not unsafe and (confidence < 0.7 or ambiguity >= 0.35):
        unsafe = "Analysis is below the safe unambiguous suggestion threshold."
    candidates = []
    for entry in raw.get("candidatePieceSlugs", []) if isinstance(raw.get("candidatePieceSlugs"), list) else []:
        if not isinstance(entry, dict) or not _text(entry.get("slug"), 160):
            continue
        candidates.append({
            "slug": _text(entry.get("slug"), 160),
            "confidence": _score(entry.get("confidence")),
            "evidence": _strings(entry.get("evidence"), 12),
        })
    return {
        "schemaVersion": SCHEMA_VERSION,
        "provider": _text(raw.get("provider"), 80) or provider,
        "model": _text(raw.get("model"), 160) or model,
        "analyzedAt": _text(raw.get("analyzedAt"), 80) or now_iso(),
        "primaryObject": primary,
        "furnitureClass": furniture,
        "specificSubtype": _text(raw.get("specificSubtype"), 200),
        "photoContext": context,
        "constructionStage": stage,
        "visibleFeatures": _strings(raw.get("visibleFeatures")),
        "woodSpecies": _strings(raw.get("woodSpecies")),
        "finishDescription": _text(raw.get("finishDescription"), 500),
        "joinery": _text(raw.get("joinery"), 300) or "not visible",
        "hardware": _strings(raw.get("hardware")),
        "shapeAndProportionNotes": _text(raw.get("shapeAndProportionNotes"), 600),
        "candidatePieceSlugs": candidates[:12],
        "searchTags": _strings(raw.get("searchTags") or raw.get("tags")),
        "description": _text(raw.get("description"), 800),
        "altTextDraft": _text(raw.get("altTextDraft"), 500),
        "confidence": confidence,
        "ambiguity": ambiguity,
        "uncertainty": _strings(raw.get("uncertainty"), 20),
        "unsafeToAutoAssignReason": unsafe,
    }
