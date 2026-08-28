"""Everything one agentic call may touch, precomputed once by the caller."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class AgenticContext:
    pdf_path: str
    page_index: int
    scratch_dir: str
    page_width: float           # display-space pt
    page_height: float
    mm_per_pt: float | None = None
    unit_system: str = "metric"
    extraction_db: str | None = None       # RO SQLite with paths/texts (display space)
    runs: list = field(default_factory=list)  # reconstructed dashed runs, display space
    texts: list[dict] = field(default_factory=list)
    trace_path: str | None = None

    # tool budgets / counters
    max_crops: int = 40
    max_python: int = 40
    max_previews: int = 20
    crop_count: int = 0
    python_count: int = 0
    preview_count: int = 0
    seen_crops: dict = field(default_factory=dict)   # (region,dpi) -> crop file
    seen_code: set = field(default_factory=set)      # sha1 of executed code

    def scratch(self) -> Path:
        p = Path(self.scratch_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p
