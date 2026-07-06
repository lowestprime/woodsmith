from __future__ import annotations

import base64
import json
import tempfile
import unittest
from pathlib import Path

from media_ai_sidecar.cache import SidecarCache
from media_ai_sidecar.indexer import scan
from media_ai_sidecar.server import MediaAiService

PNG_1X1 = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zt9sAAAAASUVORK5CYII=")


class SidecarSmokeTests(unittest.TestCase):
    def test_scan_is_bounded_resumable_and_ignores_synology_sidecars(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "media"
            cache_path = Path(directory) / "cache" / "sidecar.sqlite"
            root.mkdir()
            (root / "table.png").write_bytes(PNG_1X1)
            (root / "bench.png").write_bytes(PNG_1X1)
            sidecar = root / "@eaDir"
            sidecar.mkdir()
            (sidecar / "SYNOPHOTO_THUMB_M.jpg").write_bytes(PNG_1X1)
            cache = SidecarCache(cache_path)

            first = scan(root, cache, None, 1, False)
            second = scan(root, cache, None, 1, False)
            third = scan(root, cache, None, 1, False)
            invalid = scan(root, cache, ["../outside.jpg", "missing.jpg"], 2, False)

            self.assertEqual(first["scanned"], 1)
            self.assertEqual(first["remaining"], 1)
            self.assertFalse(first["items"][0]["cached"])
            self.assertEqual(second["scanned"], 1)
            self.assertEqual(second["remaining"], 0)
            self.assertNotEqual(first["items"][0]["relativePath"], second["items"][0]["relativePath"])
            self.assertEqual(third["scanned"], 0)
            self.assertEqual(third["upToDate"], 2)
            self.assertEqual(invalid["scanned"], 0)
            self.assertEqual(len(invalid["errors"]), 2)
            first_path = first["items"][0]["relativePath"]
            second_path = second["items"][0]["relativePath"]
            file_hash = first["items"][0]["sha256"]
            with cache.lock:
                cache.connection.execute("UPDATE files SET thumbnail_path = NULL WHERE relative_path = ?", (first_path,))
                cache.connection.commit()
            legacy_thumbnail = scan(root, cache, None, 1, False)
            self.assertEqual(legacy_thumbnail["scanned"], 1)
            self.assertEqual(legacy_thumbnail["items"][0]["relativePath"], first_path)
            cache.put_embedding({"cacheKey": f"test:{file_hash}", "relativePath": first_path, "fileHash": file_hash, "provider": "local-sidecar", "model": "test-model", "version": "1", "vectorJson": "[1.0]", "computedAt": "2026-01-01T00:00:00Z"})
            self.assertTrue(cache.has_embedding(second_path, "test-model", file_hash))
            cache.put_analysis({"cacheKey": f"test-analysis:{file_hash}", "relativePath": first_path, "fileHash": file_hash, "provider": "local", "model": "test-model", "analysisJson": json.dumps({"primaryObject": "table"}), "analyzedAt": "2026-01-01T00:00:00Z"})
            self.assertEqual(cache.get_latest_analysis(second_path, file_hash)["analysis"]["primaryObject"], "table")
            thumbnail = first["items"][0].get("thumbnailPath")
            if thumbnail:
                thumbnail_path = cache.resolve_thumbnail(thumbnail)
                self.assertIsNotNone(thumbnail_path)
                self.assertTrue(thumbnail_path.is_file())
                self.assertNotIn(root.resolve(), thumbnail_path.resolve().parents)
            cache.connection.close()

    def test_health_works_without_optional_model_dependencies(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "media"
            root.mkdir()
            service = MediaAiService(root, Path(directory) / "cache.sqlite", "sentence-transformers/clip-ViT-B-32", 4)
            health = service.health()
            self.assertTrue(health["ok"])
            self.assertEqual(health["maxBatch"], 4)
            self.assertIn("embedding", health)
            service.cache.connection.close()


if __name__ == "__main__":
    unittest.main()
