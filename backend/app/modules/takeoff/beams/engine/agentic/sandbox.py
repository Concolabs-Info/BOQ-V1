"""Dev-grade sandbox for model-authored Python (Phase A of the plan).

Limits CPU, memory, process count and wall clock; isolated interpreter (-I);
cleared environment; cwd confined to the per-call scratchpad. Known gap: no
network/filesystem *blocking* — Phase B moves the identical contract into a
container (--network=none, RO data mounts, writable /scratch only).
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

try:
    import resource
except ImportError:  # Windows has no POSIX resource module.
    resource = None  # type: ignore[assignment]

CPU_SECONDS = 30
MEM_BYTES = 1_500_000_000
WALL_SECONDS = 60
MAX_OUTPUT = 20_000


def _limits() -> None:
    # best-effort per platform: macOS rejects some limits (e.g. RLIMIT_AS below
    # current usage); the wall-clock timeout is the universal backstop
    if resource is None:
        return
    for limit, value in ((resource.RLIMIT_CPU, CPU_SECONDS),
                         (resource.RLIMIT_AS, MEM_BYTES),
                         (resource.RLIMIT_NPROC, 64)):
        try:
            resource.setrlimit(limit, (value, value))
        except (ValueError, OSError):
            pass


def run_python(code: str, scratch_dir: str | Path, preamble: str = "") -> str:
    """Execute model code with the scratchpad as cwd. Returns stdout+stderr,
    truncated. `preamble` is trusted harness code prepended before model code."""
    scratch = Path(scratch_dir)
    scratch.mkdir(parents=True, exist_ok=True)
    child_env = {
        "HOME": str(scratch),
        "USERPROFILE": str(scratch),
        "TEMP": str(scratch),
        "TMP": str(scratch),
    }
    for name in ("SYSTEMROOT", "WINDIR"):
        if os.environ.get(name):
            child_env[name] = os.environ[name]
    platform_options = (
        {"creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0)}
        if sys.platform == "win32"
        else {"preexec_fn": _limits}
    )
    try:
        proc = subprocess.run(
            [sys.executable, "-I", "-c", preamble + "\n" + code],
            cwd=scratch,
            env=child_env,
            capture_output=True,
            text=True,
            timeout=WALL_SECONDS,
            check=False,
            **platform_options,
        )
        out = proc.stdout + (("\n[stderr]\n" + proc.stderr) if proc.stderr else "")
    except subprocess.TimeoutExpired:
        out = f"[sandbox] killed: exceeded {WALL_SECONDS}s wall clock"
    if len(out) > MAX_OUTPUT:
        out = out[:MAX_OUTPUT] + f"\n[sandbox] output truncated at {MAX_OUTPUT} chars"
    return out or "[sandbox] (no output)"
