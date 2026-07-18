from __future__ import annotations

import gc
import importlib.util
import json
import os
import platform
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from types import TracebackType
from typing import Any, Literal

AcceleratorMode = Literal["auto", "cpu", "cuda"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _lease_owner_path(path: Path) -> Path:
    return path.with_name(f"{path.name}.owner.json")


def _lease_owner(path: Path) -> dict[str, Any] | None:
    try:
        payload = _lease_owner_path(path).read_bytes()
        if not payload:
            return None
        value = json.loads(payload.decode("utf-8"))
        if not isinstance(value, dict):
            return None
        pid = value.get("pid")
        action = value.get("action")
        started_at = value.get("startedAt")
        if not isinstance(pid, int) or not isinstance(action, str) or not isinstance(started_at, str):
            return None
        return {"pid": pid, "action": action, "startedAt": started_at}
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None


def _bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer from {minimum} through {maximum}.") from error
    if value < minimum or value > maximum:
        raise ValueError(f"{name} must be an integer from {minimum} through {maximum}.")
    return value


def parse_accelerator_mode(raw: str | None) -> AcceleratorMode:
    value = (raw or "auto").strip().lower()
    if value not in {"auto", "cpu", "cuda"}:
        raise ValueError("MEDIA_AI_ACCELERATOR must be auto, cpu, or cuda.")
    return value  # type: ignore[return-value]


@dataclass(frozen=True)
class CudaProbe:
    torch_available: bool
    cuda_available: bool
    torch_version: str | None
    cuda_version: str | None
    device_index: int
    device_name: str | None
    total_memory_mib: int | None
    free_memory_mib: int | None
    reason: str


def probe_cuda(device_index: int = 0) -> CudaProbe:
    if importlib.util.find_spec("torch") is None:
        return CudaProbe(False, False, None, None, device_index, None, None, None, "PyTorch is not installed.")
    try:
        import torch

        torch_version = str(torch.__version__)
        cuda_version = str(torch.version.cuda) if torch.version.cuda else None
        if not torch.cuda.is_available():
            return CudaProbe(True, False, torch_version, cuda_version, device_index, None, None, None, "PyTorch cannot use CUDA in this process.")
        count = int(torch.cuda.device_count())
        if device_index >= count:
            return CudaProbe(True, False, torch_version, cuda_version, device_index, None, None, None, f"CUDA device {device_index} is outside the visible device range.")
        properties = torch.cuda.get_device_properties(device_index)
        free_bytes, total_bytes = torch.cuda.mem_get_info(device_index)
        return CudaProbe(
            True,
            True,
            torch_version,
            cuda_version,
            device_index,
            str(properties.name),
            round(total_bytes / (1024 * 1024)),
            round(free_bytes / (1024 * 1024)),
            "PyTorch reports a usable CUDA device.",
        )
    except Exception:
        return CudaProbe(True, False, None, None, device_index, None, None, None, "The bounded PyTorch CUDA probe failed.")


class GpuLeaseBusyError(RuntimeError):
    pass


class AcceleratorState:
    def __init__(
        self,
        requested: AcceleratorMode,
        selected: Literal["cpu", "cuda"],
        probe: CudaProbe,
        batch_size: int,
        memory_limit_mib: int | None,
        lease_path: Path,
        reason: str,
    ) -> None:
        self.requested = requested
        self.selected: Literal["cpu", "cuda"] = selected
        self.probe = probe
        self.batch_size = batch_size
        self.memory_limit_mib = memory_limit_mib
        self.lease_path = lease_path
        self.reason = reason
        self.fallback_reason: str | None = None
        self.device = f"cuda:{probe.device_index}" if selected == "cuda" else "cpu"
        self._lock = threading.RLock()
        self._runtime_prepared = False
        self._lease_action: str | None = None
        self._lease_started_at: str | None = None

    def prepare_runtime(self) -> None:
        with self._lock:
            if self.selected != "cuda" or self._runtime_prepared:
                return
            import torch

            torch.cuda.set_device(self.probe.device_index)
            if self.memory_limit_mib and self.probe.total_memory_mib:
                fraction = self.memory_limit_mib / self.probe.total_memory_mib
                torch.cuda.memory.set_per_process_memory_fraction(
                    min(0.95, max(0.05, fraction)),
                    self.probe.device_index,
                )
            self._runtime_prepared = True

    def can_fallback(self, error: BaseException) -> bool:
        if self.requested != "auto" or self.selected != "cuda":
            return False
        message = str(error).lower()
        return any(
            marker in message
            for marker in (
                "cuda",
                "cudnn",
                "cublas",
                "device-side",
                "out of memory",
            )
        )

    def fallback_to_cpu(self, error: BaseException) -> bool:
        with self._lock:
            if not self.can_fallback(error):
                return False
            message = str(error).lower()
            self.fallback_reason = "cuda-out-of-memory" if "out of memory" in message else "cuda-runtime-error"
            self.selected = "cpu"
            self.device = "cpu"
            self.reason = "CUDA failed during an automatic workload; the complete operation restarted on CPU."
            self._runtime_prepared = False
        try:
            import torch

            torch.cuda.empty_cache()
        except Exception:
            pass
        gc.collect()
        return True

    def operation_status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "requested": self.requested,
                "selected": self.selected,
                "device": self.device,
                "batchSize": self.batch_size,
                "memoryLimitMiB": self.memory_limit_mib,
                "fallbackReason": self.fallback_reason,
            }

    def status(self) -> dict[str, Any]:
        with self._lock:
            memory: dict[str, int] | None = None
            if self.selected == "cuda":
                try:
                    import torch

                    free_bytes, total_bytes = torch.cuda.mem_get_info(self.probe.device_index)
                    memory = {
                        "freeMiB": round(free_bytes / (1024 * 1024)),
                        "totalMiB": round(total_bytes / (1024 * 1024)),
                        "allocatedMiB": round(torch.cuda.memory_allocated(self.probe.device_index) / (1024 * 1024)),
                        "reservedMiB": round(torch.cuda.memory_reserved(self.probe.device_index) / (1024 * 1024)),
                    }
                except Exception:
                    memory = None
            return {
                **self.operation_status(),
                "reason": self.reason,
                "torchAvailable": self.probe.torch_available,
                "cudaAvailable": self.probe.cuda_available,
                "torchVersion": self.probe.torch_version,
                "cudaVersion": self.probe.cuda_version,
                "deviceIndex": self.probe.device_index,
                "deviceName": self.probe.device_name,
                "memory": memory,
                "lease": {
                    "enabled": self.requested != "cpu" and self.probe.cuda_available,
                    "heldByThisProcess": self._lease_action is not None,
                    "activeAction": self._lease_action,
                    "startedAt": self._lease_started_at,
                    "owner": _lease_owner(self.lease_path),
                },
            }

    def lease(self, action: str) -> "GpuLease":
        return GpuLease(self, action)


def resolve_accelerator(cache_path: Path, probe: CudaProbe | None = None) -> AcceleratorState:
    requested = parse_accelerator_mode(os.getenv("MEDIA_AI_ACCELERATOR"))
    device_index = _bounded_int("MEDIA_AI_CUDA_DEVICE", 0, 0, 31)
    cuda = probe or probe_cuda(device_index)
    batch_size = _bounded_int("MEDIA_AI_EMBED_BATCH_SIZE", 16, 1, 64)
    if requested == "cuda" and not cuda.cuda_available:
        raise RuntimeError("MEDIA_AI_ACCELERATOR=cuda requires a usable PyTorch CUDA device.")
    selected: Literal["cpu", "cuda"] = "cuda" if requested != "cpu" and cuda.cuda_available else "cpu"
    memory_limit_mib = None
    if selected == "cuda" and cuda.total_memory_mib:
        configured = os.getenv("MEDIA_AI_GPU_MEMORY_LIMIT_MB", "").strip()
        desired = _bounded_int(
            "MEDIA_AI_GPU_MEMORY_LIMIT_MB",
            max(256, int(cuda.total_memory_mib * 0.60)),
            256,
            262_144,
        ) if configured else max(256, int(cuda.total_memory_mib * 0.60))
        memory_limit_mib = min(desired, max(256, int(cuda.total_memory_mib * 0.90)))
    lease_raw = os.getenv("MEDIA_AI_GPU_LEASE_FILE", "").strip()
    lease_path = Path(lease_raw).expanduser() if lease_raw else cache_path.parent / "gpu-workload.lock"
    reason = (
        "CPU execution was explicitly requested."
        if requested == "cpu"
        else "PyTorch CUDA is available and selected for sidecar embedding workloads."
        if selected == "cuda"
        else "CUDA is unavailable; automatic mode selected CPU."
    )
    return AcceleratorState(requested, selected, cuda, batch_size, memory_limit_mib, lease_path, reason)


class GpuLease:
    def __init__(self, accelerator: AcceleratorState, action: str) -> None:
        self.accelerator = accelerator
        self.action = action
        self._file = None

    def __enter__(self) -> "GpuLease":
        if self.accelerator.selected != "cuda":
            return self
        path = self.accelerator.lease_path
        path.parent.mkdir(parents=True, exist_ok=True)
        handle = path.open("a+b")
        handle.seek(0, os.SEEK_END)
        if handle.tell() == 0:
            handle.write(b"\0")
            handle.flush()
        handle.seek(0)
        try:
            if platform.system() == "Windows":
                import msvcrt

                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            handle.close()
            raise GpuLeaseBusyError("The shared GPU workload lease is already held.") from error
        started_at = _now_iso()
        owner = json.dumps({"pid": os.getpid(), "action": self.action, "startedAt": started_at}, separators=(",", ":"))
        owner_path = _lease_owner_path(path)
        owner_temp = owner_path.with_name(f"{owner_path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
        try:
            owner_temp.write_text(owner, encoding="utf-8")
            os.replace(owner_temp, owner_path)
            with self.accelerator._lock:
                self.accelerator._lease_action = self.action
                self.accelerator._lease_started_at = started_at
        except Exception:
            owner_temp.unlink(missing_ok=True)
            handle.seek(0)
            if platform.system() == "Windows":
                import msvcrt

                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            handle.close()
            raise
        self._file = handle
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        if self._file is None:
            return
        handle = self._file
        try:
            _lease_owner_path(self.accelerator.lease_path).unlink(missing_ok=True)
            handle.seek(0)
            if platform.system() == "Windows":
                import msvcrt

                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()
            with self.accelerator._lock:
                self.accelerator._lease_action = None
                self.accelerator._lease_started_at = None
