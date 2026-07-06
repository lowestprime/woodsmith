from __future__ import annotations

import hashlib
from typing import Any

from .embeddings import cosine


def hamming_hash(left: str | None, right: str | None) -> int | None:
    if not left or not right or len(left) != len(right):
        return None
    try:
        return (int(left, 16) ^ int(right, 16)).bit_count()
    except ValueError:
        return None


def stable_cluster_id(items: list[dict[str, Any]], model_key: str) -> str:
    hashes = sorted(str(item.get("hash") or item["relativePath"]) for item in items)
    digest = hashlib.sha256((model_key + "\n" + "\n".join(hashes)).encode("utf-8")).hexdigest()[:14]
    return f"bw-{digest}"


def cluster_items(items: list[dict[str, Any]], model_key: str, similarity_threshold: float = 0.84, duplicate_distance: int = 8) -> list[dict[str, Any]]:
    ordered = sorted((item for item in items if item.get("embedding")), key=lambda item: item["relativePath"])
    consumed: set[str] = set()
    output: list[dict[str, Any]] = []
    for anchor in ordered:
        if anchor["relativePath"] in consumed:
            continue
        members = [(anchor, 1.0)]
        consumed.add(anchor["relativePath"])
        for candidate in ordered:
            if candidate["relativePath"] in consumed:
                continue
            similarity = cosine(anchor["embedding"], candidate["embedding"])
            distance = hamming_hash(anchor.get("perceptualHash"), candidate.get("perceptualHash"))
            if similarity >= similarity_threshold or (distance is not None and distance <= duplicate_distance):
                members.append((candidate, similarity))
                consumed.add(candidate["relativePath"])
        if len(members) < 2:
            continue
        member_items = [item for item, _ in members]
        cluster_id = stable_cluster_id(member_items, model_key)
        representative = max(member_items, key=lambda item: (int(item.get("width") or 0) * int(item.get("height") or 0), int(item.get("sizeBytes") or 0), item["relativePath"]))
        for item, similarity in members:
            output.append({
                "clusterId": cluster_id,
                "relativePath": item["relativePath"],
                "representative": item["relativePath"] == representative["relativePath"],
                "score": round(similarity, 6),
                "label": f"Visual group {cluster_id.removeprefix('bw-')[:6]}",
            })
    return sorted(output, key=lambda item: (item["clusterId"], not item["representative"], item["relativePath"]))
