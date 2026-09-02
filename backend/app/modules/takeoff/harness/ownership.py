from __future__ import annotations

from .registry import get_expert

# Fundamental geometry is a trusted measurement basis, not a bill item by itself.
GEOMETRY_ONLY_FACTS = frozenset({
    "floor_space", "ceiling_zone_geometry", "wall_centerline", "door_opening_geometry",
    "window_opening_geometry", "roof_plane_geometry", "stair_geometry", "ramp_geometry",
})


def ownership_for(element: str) -> tuple[str, ...]:
    return get_expert(element).boq_ownership


def geometry_is_direct_boq(element: str) -> bool:
    return get_expert(element).geometry_is_boq


def owner_for_quantity(kind: str) -> str | None:
    key = kind.strip().lower().replace(" ", "_")
    rules = {
        "floor_finish": "floor", "screed": "floor", "skirting": "floor", "floor_waterproofing": "floor",
        "ceiling_finish": "ceiling", "bulkhead": "ceiling", "external_soffit": "ceiling",
        "wall_body": "walls", "wall_finish": "walls", "plaster": "walls", "render": "walls",
        "door_set": "doors", "window_set": "windows",
        "roof_covering": "roof", "roof_waterproofing": "roof", "roof_insulation": "roof", "roof_flashings": "roof",
        "stair_tread_finish": "stairs", "stair_riser_finish": "stairs", "stair_concrete": "stairs",
        "ramp_finish": "ramps", "ramp_concrete": "ramps",
        # Protected structural ownership remains unchanged.
        "slab_concrete": "slab", "slab_formwork": "slab", "slab_reinforcement": "slab",
        "beam_concrete": "beams", "column_concrete": "columns", "foundation_concrete": "foundation",
    }
    return rules.get(key)
