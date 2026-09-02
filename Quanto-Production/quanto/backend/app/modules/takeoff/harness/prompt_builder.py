from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from .registry import get_expert

_PROMPT_DIR = Path(__file__).resolve().parents[1] / "experts" / "prompts"

COMMON_EXPERT_INSTRUCTIONS = """
QUANTO HARNESS NON-NEGOTIABLES
1. Treat the supplied frozen Pre evidence as the only project authority. Never manufacture a fact from normal construction practice.
2. Be exhaustive about the requested element and conservative about classification. Missing an element and inventing an element are both errors.
3. Inspect the complete source crop systematically, including perimeter zones, cores, service rooms, small returns, repeated bays and obscured regions.
4. Distinguish physical construction geometry from annotations, dimensions, grids, furniture, MEP symbols, legends, sample details and title blocks.
5. Preserve exact visible marks/codes/text when readable. If a mark is uncertain, keep the physical entity and leave the mark unresolved rather than guessing.
6. Coordinates must stay in the exact supplied crop pixel space. Do not normalize or silently rescale.
7. The model identifies and classifies evidence; deterministic Quanto code performs official lengths, areas, slopes, volumes and BOQ arithmetic.
8. Record uncertainty explicitly in warnings/questions. Do not hide conflicts between plan, schedule, section, elevation or specification evidence.
9. Before returning, perform a completeness audit and a false-positive audit. Check that peer geometry does not duplicate or materially overlap unless the construction actually overlaps.
10. Geometry is not automatically a BOQ line. Return the physical facts needed so Quanto can derive the correct measurable sub-elements without double counting.
""".strip()


@lru_cache(maxsize=32)
def _read_prompt_file(name: str) -> str:
    path = _PROMPT_DIR / name
    if not path.exists():
        raise RuntimeError(f"Missing element expert prompt: {path}")
    return path.read_text(encoding="utf-8").strip()


def expert_prompt(element: str) -> str:
    spec = get_expert(element)
    parts = [_read_prompt_file(name) for name in spec.prompt_files]
    return "\n\n".join(parts)


def compose_system(element: str, system: str) -> str:
    return f"{system.strip()}\n\n{COMMON_EXPERT_INSTRUCTIONS}".strip()


def compose_prompt(element: str, prompt: str, *, schema_name: str | None = None, repair_reason: str | None = None) -> str:
    suffix = expert_prompt(element)
    phase = f"\nStructured response contract: {schema_name}." if schema_name else ""
    repair = ""
    if repair_reason:
        repair = (
            "\n\nTARGETED REPAIR\nThe previous structured result was rejected by deterministic Quanto validation. "
            "Correct only the unsupported/invalid parts while re-auditing the whole requested element. Rejection:\n"
            f"{repair_reason[:2500]}"
        )
    return f"{prompt.strip()}\n\n{suffix}{phase}{repair}".strip()
