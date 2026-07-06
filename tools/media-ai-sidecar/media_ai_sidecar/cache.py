from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


class SidecarCache:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.connection = sqlite3.connect(path, timeout=30, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS files (
              relative_path TEXT PRIMARY KEY,
              size_bytes INTEGER NOT NULL,
              mtime_ns INTEGER NOT NULL,
              sha256 TEXT NOT NULL,
              perceptual_hash TEXT,
              width INTEGER,
              height INTEGER,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS embeddings (
              cache_key TEXT PRIMARY KEY,
              relative_path TEXT NOT NULL,
              file_hash TEXT NOT NULL,
              provider TEXT NOT NULL,
              model TEXT NOT NULL,
              version TEXT NOT NULL,
              vector_json TEXT NOT NULL,
              computed_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_embeddings_path ON embeddings(relative_path);
            CREATE TABLE IF NOT EXISTS analyses (
              cache_key TEXT PRIMARY KEY,
              relative_path TEXT NOT NULL,
              file_hash TEXT NOT NULL,
              provider TEXT NOT NULL,
              model TEXT NOT NULL,
              analysis_json TEXT NOT NULL,
              analyzed_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_analyses_path ON analyses(relative_path);
            CREATE TABLE IF NOT EXISTS clusters (
              cluster_id TEXT NOT NULL,
              relative_path TEXT NOT NULL,
              representative INTEGER NOT NULL DEFAULT 0,
              score REAL NOT NULL DEFAULT 0,
              model_key TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY(cluster_id, relative_path)
            );
            """
        )

    def get_file(self, relative_path: str) -> dict[str, Any] | None:
        row = self.connection.execute("SELECT * FROM files WHERE relative_path = ?", (relative_path,)).fetchone()
        return dict(row) if row else None

    def put_file(self, record: dict[str, Any]) -> None:
        self.connection.execute(
            """INSERT INTO files(relative_path,size_bytes,mtime_ns,sha256,perceptual_hash,width,height,updated_at)
               VALUES(:relativePath,:sizeBytes,:mtimeNs,:sha256,:perceptualHash,:width,:height,:updatedAt)
               ON CONFLICT(relative_path) DO UPDATE SET size_bytes=excluded.size_bytes,mtime_ns=excluded.mtime_ns,
               sha256=excluded.sha256,perceptual_hash=excluded.perceptual_hash,width=excluded.width,height=excluded.height,updated_at=excluded.updated_at""",
            record,
        )
        self.connection.commit()

    def get_embedding(self, cache_key: str) -> dict[str, Any] | None:
        row = self.connection.execute("SELECT * FROM embeddings WHERE cache_key = ?", (cache_key,)).fetchone()
        if not row:
            return None
        data = dict(row)
        data["embedding"] = json.loads(data.pop("vector_json"))
        return data

    def put_embedding(self, record: dict[str, Any]) -> None:
        self.connection.execute(
            """INSERT OR REPLACE INTO embeddings(cache_key,relative_path,file_hash,provider,model,version,vector_json,computed_at)
               VALUES(:cacheKey,:relativePath,:fileHash,:provider,:model,:version,:vectorJson,:computedAt)""",
            record,
        )
        self.connection.commit()

    def get_analysis(self, cache_key: str) -> dict[str, Any] | None:
        row = self.connection.execute("SELECT * FROM analyses WHERE cache_key = ?", (cache_key,)).fetchone()
        if not row:
            return None
        data = dict(row)
        data["analysis"] = json.loads(data.pop("analysis_json"))
        return data

    def put_analysis(self, record: dict[str, Any]) -> None:
        self.connection.execute(
            """INSERT OR REPLACE INTO analyses(cache_key,relative_path,file_hash,provider,model,analysis_json,analyzed_at)
               VALUES(:cacheKey,:relativePath,:fileHash,:provider,:model,:analysisJson,:analyzedAt)""",
            record,
        )
        self.connection.commit()

    def replace_clusters(self, clusters: list[dict[str, Any]], model_key: str, updated_at: str) -> None:
        self.connection.execute("DELETE FROM clusters WHERE model_key = ?", (model_key,))
        self.connection.executemany(
            "INSERT INTO clusters(cluster_id,relative_path,representative,score,model_key,updated_at) VALUES(?,?,?,?,?,?)",
            [(item["clusterId"], item["relativePath"], int(item["representative"]), item["score"], model_key, updated_at) for item in clusters],
        )
        self.connection.commit()

    def summary(self) -> dict[str, int]:
        result = {}
        for table in ("files", "embeddings", "analyses", "clusters"):
            result[table] = int(self.connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
        return result
