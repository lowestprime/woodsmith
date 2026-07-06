from __future__ import annotations

import base64
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
            sidecar = root / "@eaDir"
            sidecar.mkdir()
            (sidecar / "SYNOPHOTO_THUMB_M.jpg").write_bytes(PNG_1X1)
            cache = SidecarCache(cache_path)

            first = scan(root, cache, None, 10, False)
            second = scan(root, cache, None, 10, False)

            self.assertEqual(first["scanned"], 1)
            self.assertEqual(first["items"][0]["relativePath"], "table.png")
            self.assertFalse(first["items"][0]["cached"])
            self.assertTrue(second["items"][0]["cached"])
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
