from __future__ import annotations

"""Production BOQ candidates for the new shared element harness.

The target element engines deliberately persist geometry and derived quantities in
normalised production tables.  Review/BOQ should consume those quantities instead
of re-measuring the UI polygons or falling back to demo seed data.

Beams, Columns, Slabs and Foundations are intentionally not read here; their
existing paths remain authoritative and untouched.
"""

from collections.abc import Iterable
from typing import Any

from ....database.connection import fetch_all


TARGET_ELEMENTS = ("floor", "ceiling", "walls", "doors", "windows", "roof", "stairs", "ramps")


def _candidate(
    *,
    id: str,
    element: str,
    entity_type: str,
    section: str,
    item_code: str | None,
    description: str,
    quantity: float | int | None,
    unit: str,
    floor_ids: Iterable[Any] = (),
    source_ids: Iterable[Any] = (),
    basis: str | None = None,
) -> dict[str, Any] | None:
    if quantity is None:
        return None
    try:
        number = float(quantity)
    except (TypeError, ValueError):
        return None
    if number <= 0:
        return None
    return {
        "id": id,
        "element": element,
        "entity_type": entity_type,
        "section": section,
        "item_code": item_code,
        "description": description,
        "quantity": round(number, 4),
        "unit": unit,
        "floor_ids": sorted({str(value) for value in floor_ids if value}),
        "source_ids": sorted({str(value) for value in source_ids if value}),
        "basis": basis,
    }


def _safe_rows(sql: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
    """Load production rows without disguising a schema/database failure as zero work."""
    return fetch_all(sql, params)


def _floor_candidates(project_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    finishes = _safe_rows(
        """SELECT fd.id AS family_id,fd.original_tag AS mark,fd.name,fd.description,fd.material,
                  fa.measurement_unit,
                  SUM(COALESCE(fa.nrm_quantity,0)*COALESCE(tf.typical_factor,1)) AS quantity,
                  array_agg(DISTINCT fa.floor_id::text) AS floor_ids,
                  array_agg(DISTINCT fa.id::text) AS source_ids
           FROM finish_assignment fa
           JOIN finish_definition fd ON fd.id=fa.finish_id
           JOIN floor_space fs ON fs.id=fa.room_id
           JOIN takeoff_floor tf ON tf.id=fa.floor_id
           WHERE fa.project_id=%s AND fa.user_confirmed=true
             AND fs.geometry_status IN ('wall_verified','user_verified')
           GROUP BY fd.id,fd.original_tag,fd.name,fd.description,fd.material,fa.measurement_unit
           ORDER BY fd.original_tag NULLS LAST,fd.name""",
        (project_id,),
    )
    for value in finishes:
        item = _candidate(
            id=f"PROD-FLOOR-FINISH-{value['family_id']}",
            element="floor",
            entity_type="floor_finish",
            section="Floor finishes",
            item_code=value.get("mark") or "28",
            description="; ".join(filter(None, [value.get("description") or value.get("name"), value.get("material")])),
            quantity=value.get("quantity"),
            unit=value.get("measurement_unit") or "m²",
            floor_ids=value.get("floor_ids") or [],
            source_ids=value.get("source_ids") or [],
            basis="confirmed finish assignments measured from FloorSpace/finish zones",
        )
        if item:
            rows.append(item)

    works = _safe_rows(
        """SELECT fwa.work_type,fwd.code,fwd.name,fwd.description,fwa.measurement_unit,
                  SUM(COALESCE(fwa.nrm_quantity,0)*COALESCE(tf.typical_factor,1)) AS quantity,
                  array_agg(DISTINCT fwa.floor_id::text) AS floor_ids,
                  array_agg(DISTINCT fwa.id::text) AS source_ids
           FROM floor_work_assignment fwa
           LEFT JOIN floor_work_definition fwd ON fwd.id=fwa.definition_id
           JOIN floor_space fs ON fs.id=fwa.room_id
           JOIN takeoff_floor tf ON tf.id=fwa.floor_id
           WHERE fwa.project_id=%s AND fwa.user_confirmed=true AND fwa.nrm_quantity IS NOT NULL
             AND fs.geometry_status IN ('wall_verified','user_verified')
           GROUP BY fwa.work_type,fwd.code,fwd.name,fwd.description,fwa.measurement_unit
           ORDER BY fwa.work_type,fwd.code NULLS LAST""",
        (project_id,),
    )
    names = {
        "screed": ("floor_screed", "Floor, wall and ceiling finishes — Screeds", "28.1"),
        "waterproofing": ("floor_waterproofing", "Waterproofing / floor finishes", "19/28"),
        "underlay": ("floor_underlay", "Floor, wall and ceiling finishes", "28"),
        "board_insulation": ("floor_insulation", "Insulation", "31"),
        "quilt_insulation": ("floor_insulation", "Insulation", "31"),
        "isolation_membrane": ("floor_membrane", "Floor, wall and ceiling finishes", "28"),
        "sealer": ("floor_sealer", "Floor, wall and ceiling finishes", "28"),
        "skirting": ("floor_skirting", "Floor, wall and ceiling finishes — Skirting", "28.14"),
    }
    for index, value in enumerate(works):
        work_type = str(value.get("work_type") or "floor_work")
        entity_type, section, fallback_code = names.get(work_type, ("floor_work", "Floor, wall and ceiling finishes", "28"))
        item = _candidate(
            id=f"PROD-FLOOR-WORK-{work_type}-{value.get('code') or index}",
            element="floor",
            entity_type=entity_type,
            section=section,
            item_code=value.get("code") or fallback_code,
            description=value.get("description") or value.get("name") or work_type.replace("_", " ").title(),
            quantity=value.get("quantity"),
            unit=value.get("measurement_unit") or ("m" if work_type == "skirting" else "m²"),
            floor_ids=value.get("floor_ids") or [],
            source_ids=value.get("source_ids") or [],
            basis="confirmed Floor derived-work assignment; opening deductions are applied to skirting",
        )
        if item:
            rows.append(item)
    return rows


def _ceiling_candidates(project_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    zones = _safe_rows(
        """SELECT cd.id AS family_id,cd.code,cd.name,cd.description,cd.material,
                  SUM(COALESCE(cz.surface_area_m2,cz.net_area_m2,0)*COALESCE(tf.typical_factor,1)) AS quantity,
                  array_agg(DISTINCT cz.floor_id::text) AS floor_ids,
                  array_agg(DISTINCT cz.id::text) AS source_ids
           FROM ceiling_zone cz
           LEFT JOIN ceiling_definition cd ON cd.id=cz.definition_id
           JOIN takeoff_floor tf ON tf.id=cz.floor_id
           WHERE cz.project_id=%s AND cz.include_in_boq=true AND cz.user_confirmed=true
                 AND cz.profile_type NOT IN ('no_ceiling','open_to_sky')
           GROUP BY cd.id,cd.code,cd.name,cd.description,cd.material
           ORDER BY cd.code NULLS LAST,cd.name""",
        (project_id,),
    )
    for index, value in enumerate(zones):
        item = _candidate(
            id=f"PROD-CEILING-{value.get('family_id') or index}",
            element="ceiling",
            entity_type="ceiling",
            section="Ceilings",
            item_code=value.get("code") or "28",
            description="; ".join(filter(None, [value.get("description") or value.get("name") or "Ceiling finish/system", value.get("material")])),
            quantity=value.get("quantity"),
            unit="m²",
            floor_ids=value.get("floor_ids") or [],
            source_ids=value.get("source_ids") or [],
            basis="confirmed ceiling surface area; inherited FloorSpace is used only when no controlling RCP overrides it",
        )
        if item:
            rows.append(item)
    features = _safe_rows(
        """SELECT cf.feature_type,cf.measurement_unit,
                  SUM(COALESCE(cf.net_quantity,0)*COALESCE(tf.typical_factor,1)) AS quantity,
                  array_agg(DISTINCT cf.floor_id::text) AS floor_ids,
                  array_agg(DISTINCT cf.id::text) AS source_ids
           FROM ceiling_feature cf JOIN takeoff_floor tf ON tf.id=cf.floor_id
           WHERE cf.project_id=%s AND cf.include_in_boq=true AND cf.user_confirmed=true
           GROUP BY cf.feature_type,cf.measurement_unit ORDER BY cf.feature_type""",
        (project_id,),
    )
    for value in features:
        feature = str(value.get("feature_type") or "ceiling_feature")
        item = _candidate(
            id=f"PROD-CEILING-FEATURE-{feature}-{value.get('measurement_unit') or 'unit'}",
            element="ceiling",
            entity_type="ceiling_feature",
            section="Ceiling features / associated work",
            item_code="28",
            description=feature.replace("_", " ").title(),
            quantity=value.get("quantity"),
            unit=value.get("measurement_unit") or "m²",
            floor_ids=value.get("floor_ids") or [],
            source_ids=value.get("source_ids") or [],
            basis="confirmed ceiling feature geometry",
        )
        if item:
            rows.append(item)
    return rows


def _wall_candidates(project_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    construction = _safe_rows(
        """SELECT wd.id AS family_id,wd.code,wd.name,wd.description,wd.material,wd.wall_kind,wd.construction,wd.thickness_mm,
                  COALESCE(wd.nrm_work_section,'Wall construction') AS work_section,
                  SUM(COALESCE(wi.net_area_m2,0)*COALESCE(tf.typical_factor,1)) AS area_m2,
                  SUM(COALESCE(wi.net_area_m2,0)*COALESCE(wd.thickness_mm,0)/1000.0*COALESCE(tf.typical_factor,1)) AS volume_m3,
                  array_agg(DISTINCT wi.floor_id::text) AS floor_ids,
                  array_agg(DISTINCT wi.id::text) AS source_ids
           FROM wall_instance wi JOIN wall_definition wd ON wd.id=wi.definition_id
           JOIN takeoff_floor tf ON tf.id=wi.floor_id
           WHERE wi.project_id=%s AND wi.include_in_boq=true AND wi.user_confirmed=true
           GROUP BY wd.id,wd.code,wd.name,wd.description,wd.material,wd.wall_kind,wd.construction,wd.thickness_mm,wd.nrm_work_section
           ORDER BY wd.code""",
        (project_id,),
    )
    concrete_family_ids: set[str] = set()
    for value in construction:
        text = " ".join(str(value.get(key) or "") for key in ("wall_kind", "construction", "material", "name", "description")).lower()
        concrete = value.get("wall_kind") == "concrete" or "reinforced concrete" in text or "in-situ concrete" in text or "in situ concrete" in text
        common = dict(floor_ids=value.get("floor_ids") or [], source_ids=value.get("source_ids") or [])
        if concrete and value.get("thickness_mm"):
            concrete_family_ids.add(str(value["family_id"]))
            item = _candidate(
                id=f"PROD-WALL-CONCRETE-{value['family_id']}", element="walls", entity_type="wall_concrete",
                section="In-situ concrete — Walls", item_code=value.get("code") or "11",
                description=f"{value.get('description') or value.get('name') or 'Concrete wall'}; {float(value['thickness_mm']):g} mm",
                quantity=value.get("volume_m3"), unit="m³", basis="confirmed wall net face area × supported thickness", **common,
            )
            if item:
                rows.append(item)
            item = _candidate(
                id=f"PROD-WALL-FORMWORK-{value['family_id']}", element="walls", entity_type="wall_formwork",
                section="In-situ concrete — Formwork", item_code=f"11.2-{value.get('code') or ''}",
                description=f"Formwork to two main faces of {value.get('description') or value.get('name') or 'concrete wall'}",
                quantity=float(value.get("area_m2") or 0) * 2.0, unit="m²",
                basis="two confirmed main wall faces; opening/free-end reveals remain evidence-dependent", **common,
            )
            if item:
                rows.append(item)
        else:
            item = _candidate(
                id=f"PROD-WALL-{value['family_id']}", element="walls", entity_type="wall",
                section=value.get("work_section") or "Wall construction", item_code=value.get("code") or "14",
                description="; ".join(filter(None, [value.get("description") or value.get("name") or "Wall construction", value.get("material")])),
                quantity=value.get("area_m2"), unit="m²", basis="confirmed net wall area after supported opening deductions", **common,
            )
            if item:
                rows.append(item)

    finishes = _safe_rows(
        """SELECT wfd.id AS family_id,wfd.code,wfd.name,wfd.description,wfd.material,
                  SUM(COALESCE(wff.net_area_m2,0)*COALESCE(tf.typical_factor,1)) AS quantity,
                  array_agg(DISTINCT wff.floor_id::text) AS floor_ids,
                  array_agg(DISTINCT wff.id::text) AS source_ids
           FROM wall_face_finish wff JOIN wall_finish_definition wfd ON wfd.id=wff.finish_id
           JOIN takeoff_floor tf ON tf.id=wff.floor_id
           WHERE wff.project_id=%s AND wff.user_confirmed=true
           GROUP BY wfd.id,wfd.code,wfd.name,wfd.description,wfd.material ORDER BY wfd.code""",
        (project_id,),
    )
    for value in finishes:
        item = _candidate(
            id=f"PROD-WALL-FINISH-{value['family_id']}", element="walls", entity_type="wall_finish",
            section="Wall finishes", item_code=value.get("code") or "28",
            description="; ".join(filter(None, [value.get("description") or value.get("name") or "Wall finish", value.get("material")])),
            quantity=value.get("quantity"), unit="m²", floor_ids=value.get("floor_ids") or [], source_ids=value.get("source_ids") or [],
            basis="confirmed wall-face finish assignment net of supported openings",
        )
        if item:
            rows.append(item)
    return rows


def _opening_candidates(project_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    openings = _safe_rows(
        """SELECT od.id AS family_id,od.code,od.kind,od.name,od.description,od.width_mm,od.height_mm,od.material,
                  od.frame_material,od.glazing,od.operation,od.fire_rating,od.finish,od.ironmongery_set,od.nrm_work_section,
                  SUM(COALESCE(tf.typical_factor,1)) AS quantity,
                  array_agg(DISTINCT oi.floor_id::text) AS floor_ids,
                  array_agg(DISTINCT oi.id::text) AS source_ids
           FROM opening_instance oi JOIN opening_definition od ON od.id=oi.definition_id
           JOIN takeoff_floor tf ON tf.id=oi.floor_id
           WHERE oi.project_id=%s AND oi.include_in_boq=true AND oi.user_confirmed=true AND oi.status<>'deleted'
                 AND od.status<>'deleted' AND od.code NOT LIKE 'UNASSIGNED-%%'
           GROUP BY od.id,od.code,od.kind,od.name,od.description,od.width_mm,od.height_mm,od.material,
                    od.frame_material,od.glazing,od.operation,od.fire_rating,od.finish,od.ironmongery_set,od.nrm_work_section
           ORDER BY od.kind,od.code""",
        (project_id,),
    )
    ironmongery: dict[str, dict[str, Any]] = {}
    for value in openings:
        kind = str(value.get("kind") or "door")
        details = [value.get("description") or value.get("name") or kind.title()]
        if value.get("width_mm") and value.get("height_mm"):
            details.append(f"{float(value['width_mm']):g} × {float(value['height_mm']):g} mm")
        for key in ("material", "frame_material", "glazing", "operation", "fire_rating", "finish"):
            if value.get(key):
                details.append(str(value[key]))
        item = _candidate(
            id=f"PROD-OPENING-{value['family_id']}", element="doors" if kind == "door" else "windows", entity_type=kind,
            section=value.get("nrm_work_section") or ("Doors" if kind == "door" else "Windows"), item_code=value.get("code"),
            description="; ".join(details), quantity=value.get("quantity"), unit="nr",
            floor_ids=value.get("floor_ids") or [], source_ids=value.get("source_ids") or [],
            basis="confirmed plan instances bound to door/window definition and schedule evidence",
        )
        if item:
            rows.append(item)
        set_name = str(value.get("ironmongery_set") or "").strip()
        if kind == "door" and set_name:
            target = ironmongery.setdefault(set_name, {"quantity": 0.0, "floors": set(), "sources": set()})
            target["quantity"] += float(value.get("quantity") or 0)
            target["floors"].update(value.get("floor_ids") or [])
            target["sources"].update(value.get("source_ids") or [])
    for set_name, value in ironmongery.items():
        item = _candidate(
            id=f"PROD-DOOR-IRONMONGERY-{set_name}", element="doors", entity_type="door_ironmongery",
            section="Doors — Ironmongery", item_code=set_name, description=f"Ironmongery set {set_name}",
            quantity=value["quantity"], unit="set", floor_ids=value["floors"], source_ids=value["sources"],
            basis="one explicitly scheduled ironmongery set per confirmed door instance",
        )
        if item:
            rows.append(item)
    return rows


def _roof_candidates(project_id: str) -> list[dict[str, Any]]:
    # Structural roof-slab work is deliberately excluded here. Slab is a protected
    # existing element and remains the BOQ owner for concrete/reinforcement/formwork.
    structural = {"concrete_roof", "roof_reinforcement", "roof_formwork", "roof_edge_formwork"}
    values = _safe_rows(
        """SELECT rq.*,rl.host_floor_id
           FROM roof_quantity rq
           JOIN roof_level rl ON rl.id=rq.level_id
           LEFT JOIN roof_plane rp ON rp.id=rq.plane_id
           WHERE rq.project_id=%s AND rq.quantity IS NOT NULL AND rq.review_required=false
                 AND (rq.plane_id IS NULL OR rp.user_confirmed=true)
           ORDER BY rq.work_section,rq.description""",
        (project_id,),
    )
    rows: list[dict[str, Any]] = []
    for value in values:
        if str(value.get("entity_type") or "") in structural:
            continue
        item = _candidate(
            id=f"PROD-ROOF-{value['id']}", element="roof", entity_type="roof",
            section=value.get("work_section") or "Roof", item_code=value.get("item_code"),
            description=value.get("description") or "Roof work", quantity=value.get("quantity"), unit=value.get("unit") or "m²",
            floor_ids=[value.get("host_floor_id")], source_ids=[value.get("entity_id") or value.get("id")],
            basis=value.get("basis"),
        )
        if item:
            rows.append(item)
    return rows


def _stair_ramp_candidates(project_id: str) -> list[dict[str, Any]]:
    values = _safe_rows(
        """SELECT i.*,f.code AS family_code,f.name AS family_name,f.tread_finish_code,f.riser_finish_code,f.string_finish_code,
                  b.code AS rail_code,tf.typical_factor
           FROM stair_ramp_instance i
           LEFT JOIN stair_ramp_family f ON f.id=i.family_id
           LEFT JOIN balustrade_family b ON b.id=i.rail_family_id
           JOIN takeoff_floor tf ON tf.id=i.floor_id
           WHERE i.project_id=%s AND i.include_in_boq=true AND i.user_confirmed=true AND i.status<>'deleted'
           ORDER BY tf.level_index,i.created_at""",
        (project_id,),
    )
    rows: list[dict[str, Any]] = []
    for value in values:
        factor = float(value.get("typical_factor") or 1)
        kind = str(value.get("kind") or "stair")
        element = "stairs" if kind == "stair" else "ramps"
        mark = value.get("family_code") or kind.upper()
        name = value.get("family_name") or kind.title()
        common = dict(floor_ids=[value.get("floor_id")], source_ids=[value.get("id")])
        quantities = [
            ("concrete_volume_m3", "stair_concrete" if kind == "stair" else "ramp_concrete", "In-situ concrete", f"Concrete to {name}", "m³", "11"),
            ("formwork_soffit_m2", "stair_formwork" if kind == "stair" else "ramp_formwork", "In-situ concrete — Formwork", f"Formwork to soffit/sides of {name}", "m²", "11.2"),
            ("tread_finish_area_m2", "stair_tread_finish", "Stair finishes", f"Tread finish to {name}", "m²", value.get("tread_finish_code") or "28.11"),
            ("riser_finish_area_m2", "stair_riser_finish", "Stair finishes", f"Riser finish to {name}", "m²", value.get("riser_finish_code") or "28.12"),
            ("string_apron_finish_area_m2", "stair_string_finish", "Stair finishes", f"String/apron finish to {name}", "m²", value.get("string_finish_code") or "28.13"),
            ("ramp_finish_area_m2", "ramp_finish", "Ramp finishes", f"Finish to {name}", "m²", "28"),
            ("balustrade_length_m", "stair_balustrade" if kind == "stair" else "ramp_balustrade", "Stairs / walkways / balustrades", f"Balustrade/handrail to {name}", "m", value.get("rail_code") or "25"),
        ]
        for key, entity_type, section, description, unit, code in quantities:
            raw = value.get(key)
            if raw is None:
                continue
            item = _candidate(
                id=f"PROD-{kind.upper()}-{value['id']}-{key}", element=element, entity_type=entity_type,
                section=section, item_code=str(code), description=description, quantity=float(raw) * factor, unit=unit,
                basis=f"confirmed {kind} multi-view geometry and deterministic quantity calculation", **common,
            )
            if item:
                rows.append(item)
    return rows


def production_boq_candidates(project_id: str) -> dict[str, Any]:
    """Return confirmed, measurable BOQ candidates for only the new harness elements."""
    pid = str(project_id)
    candidates: list[dict[str, Any]] = []
    for loader in (
        _floor_candidates,
        _ceiling_candidates,
        _wall_candidates,
        _opening_candidates,
        _roof_candidates,
        _stair_ramp_candidates,
    ):
        candidates.extend(loader(pid))
    return {
        "project_id": pid,
        "elements": list(TARGET_ELEMENTS),
        "candidates": candidates,
        "count": len(candidates),
        "note": "Only confirmed target-element work is emitted. Floor/Ceiling geometry itself is evidence, not a BOQ item. Beam/Column/Slab/Foundation ownership remains unchanged.",
    }
