from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from media_ai_sidecar.accelerator import (
    CudaProbe,
    GpuLeaseBusyError,
    parse_accelerator_mode,
    resolve_accelerator,
)
from media_ai_sidecar.benchmark import _equivalence
from media_ai_sidecar.server import loopback_host, token_matches


VISIBLE_CUDA = CudaProbe(
    torch_available=True,
    cuda_available=True,
    torch_version="2.test",
    cuda_version="12.8",
    device_index=0,
    device_name="Test GPU",
    total_memory_mib=8192,
    free_memory_mib=7000,
    reason="test",
)


class AcceleratorTests(unittest.TestCase):
    def test_mode_selection_and_memory_bounds_are_strict(self) -> None:
        self.assertEqual(parse_accelerator_mode(None), "auto")
        self.assertEqual(parse_accelerator_mode(" CPU "), "cpu")
        with self.assertRaisesRegex(ValueError, "must be auto, cpu, or cuda"):
            parse_accelerator_mode("gpu")

        with tempfile.TemporaryDirectory() as directory, patch.dict(
            "os.environ",
            {
                "MEDIA_AI_ACCELERATOR": "auto",
                "MEDIA_AI_GPU_MEMORY_LIMIT_MB": "4096",
                "MEDIA_AI_EMBED_BATCH_SIZE": "8",
            },
            clear=False,
        ):
            state = resolve_accelerator(Path(directory) / "cache.sqlite", VISIBLE_CUDA)
            self.assertEqual(state.selected, "cuda")
            self.assertEqual(state.device, "cuda:0")
            self.assertEqual(state.memory_limit_mib, 4096)
            self.assertEqual(state.batch_size, 8)

    def test_forced_cuda_fails_and_auto_falls_back_only_for_cuda_errors(self) -> None:
        unavailable = CudaProbe(True, False, "2.test", "12.8", 0, None, None, None, "test")
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            "os.environ", {"MEDIA_AI_ACCELERATOR": "cuda"}, clear=False
        ):
            with self.assertRaisesRegex(RuntimeError, "requires a usable PyTorch CUDA device"):
                resolve_accelerator(Path(directory) / "cache.sqlite", unavailable)

        with tempfile.TemporaryDirectory() as directory, patch.dict(
            "os.environ", {"MEDIA_AI_ACCELERATOR": "auto"}, clear=False
        ):
            state = resolve_accelerator(Path(directory) / "cache.sqlite", VISIBLE_CUDA)
            self.assertFalse(state.fallback_to_cpu(RuntimeError("invalid input")))
            self.assertTrue(state.fallback_to_cpu(RuntimeError("CUDA out of memory")))
            self.assertEqual(state.selected, "cpu")
            self.assertEqual(state.fallback_reason, "cuda-out-of-memory")

    def test_shared_gpu_lease_prevents_concurrent_heavy_work(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            "os.environ", {"MEDIA_AI_ACCELERATOR": "auto"}, clear=False
        ):
            cache = Path(directory) / "cache.sqlite"
            first = resolve_accelerator(cache, VISIBLE_CUDA)
            second = resolve_accelerator(cache, VISIBLE_CUDA)
            with first.lease("embed"):
                self.assertTrue(first.status()["lease"]["heldByThisProcess"])
                owner = second.status()["lease"]["owner"]
                self.assertEqual(owner["action"], "embed")
                self.assertIsInstance(owner["pid"], int)
                with self.assertRaises(GpuLeaseBusyError):
                    with second.lease("analyze"):
                        pass
            self.assertFalse(first.status()["lease"]["heldByThisProcess"])
            self.assertIsNone(second.status()["lease"]["owner"])

    def test_token_matching_and_nonloopback_binding_policy(self) -> None:
        self.assertTrue(token_matches(None, None))
        self.assertTrue(token_matches("secret", "Bearer secret"))
        self.assertFalse(token_matches("secret", "Bearer wrong"))
        self.assertFalse(token_matches("secret", None))
        self.assertTrue(loopback_host("127.0.0.1"))
        self.assertTrue(loopback_host("::1"))
        self.assertTrue(loopback_host("localhost"))
        self.assertFalse(loopback_host("0.0.0.0"))

    def test_benchmark_equivalence_requires_stable_rankings_and_bounded_drift(self) -> None:
        cpu = {"semantic": {"rankings": [[0, 1]], "scores": [[0.8, 0.2]]}}
        equivalent = {"semantic": {"rankings": [[0, 1]], "scores": [[0.8005, 0.1995]]}}
        reordered = {"semantic": {"rankings": [[1, 0]], "scores": [[0.8, 0.2]]}}
        drifted = {"semantic": {"rankings": [[0, 1]], "scores": [[0.802, 0.198]]}}

        self.assertTrue(_equivalence(cpu, equivalent)["equivalent"])
        self.assertFalse(_equivalence(cpu, reordered)["equivalent"])
        self.assertFalse(_equivalence(cpu, drifted)["equivalent"])


if __name__ == "__main__":
    unittest.main()
