from __future__ import annotations

from ..experts.profiles.ceiling import SPEC as CEILING
from ..experts.profiles.doors import SPEC as DOORS
from ..experts.profiles.floor import SPEC as FLOOR
from ..experts.profiles.ramps import SPEC as RAMPS
from ..experts.profiles.roof import SPEC as ROOF
from ..experts.profiles.stairs import SPEC as STAIRS
from ..experts.profiles.walls import SPEC as WALLS
from ..experts.profiles.windows import SPEC as WINDOWS
from .contracts import ElementExpertSpec

# Each target element owns a separate expert profile/prompt/strategy/evaluator contract,
# while all experts share one runtime, model/auth bridge, state, evidence and capability
# layer. Doors+Windows and Stairs+Ramps keep their existing combined persistence engines
# for compatibility, but remain logically separate experts.
_EXPERTS: dict[str, ElementExpertSpec] = {item.key: item for item in (FLOOR, CEILING, WALLS, DOORS, WINDOWS, ROOF, STAIRS, RAMPS)}
_EXPERTS["doors-windows"] = ElementExpertSpec(
    key="doors-windows", runtime_key="doors-windows", display_name="Doors & Windows", scope_key="doors-windows",
    prompt_files=DOORS.prompt_files + WINDOWS.prompt_files,
    publishes=("opening_area",) + DOORS.publishes + WINDOWS.publishes,
    consumes=tuple(dict.fromkeys(DOORS.consumes + WINDOWS.consumes)),
    boq_ownership=DOORS.boq_ownership + WINDOWS.boq_ownership,
    strategies=DOORS.strategies + WINDOWS.strategies,
    validation_focus=DOORS.validation_focus + WINDOWS.validation_focus,
)
_EXPERTS["stairs-ramps"] = ElementExpertSpec(
    key="stairs-ramps", runtime_key="stairs-ramps", display_name="Stairs & Ramps", scope_key="stairs-ramps",
    prompt_files=STAIRS.prompt_files + RAMPS.prompt_files,
    publishes=STAIRS.publishes + RAMPS.publishes,
    consumes=tuple(dict.fromkeys(STAIRS.consumes + RAMPS.consumes)),
    boq_ownership=STAIRS.boq_ownership + RAMPS.boq_ownership,
    strategies=STAIRS.strategies + RAMPS.strategies,
    validation_focus=STAIRS.validation_focus + RAMPS.validation_focus,
)

PROTECTED_EXISTING_ELEMENTS = frozenset({"beams", "columns", "slab", "foundation"})


def get_expert(key: str) -> ElementExpertSpec:
    normalized = key.strip().lower().replace("_", "-")
    if normalized in PROTECTED_EXISTING_ELEMENTS:
        raise ValueError(f"{normalized} remains on its existing implementation and is not routed through the new element harness")
    try:
        return _EXPERTS[normalized]
    except KeyError as exc:
        raise ValueError(f"Unknown harness element: {key}") from exc


def list_experts() -> list[ElementExpertSpec]:
    return [_EXPERTS[key] for key in ("floor", "ceiling", "walls", "doors", "windows", "roof", "stairs", "ramps")]
