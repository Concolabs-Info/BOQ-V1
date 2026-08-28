from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any
from uuid import UUID

from shapely.geometry import Polygon

from ...database.json_value import Jsonb

from ...core.config import get_settings
from ...database.connection import fetch_all, fetch_one, transaction
from ...services.ai.model_client import get_model_client
from ...services.pdf.media import ensure_viewport_crop
from .common import (
    PALETTE,
    area_m2,
    content_hash,
    ensure_takeoff_floors,
    extract_viewport_text,
    model_for_quality,
    project_text_evidence,
    require_frozen_project,
    source_mm_per_pixel,
    viewport_demo_context,
)
from .model_schemas import (
    CeilingCatalogOutput,
    CeilingGeometryOutput,
    SectionObservationOutput,
)
from .prompts import (
    CEILING_CATALOG_PROMPT,
    CEILING_CATALOG_SYSTEM,
    CEILING_GEOMETRY_PROMPT,
    CEILING_SYSTEM,
    SECTION_PROMPT,
    SECTION_SYSTEM,
)


def _validate_ceiling_geometry(output: CeilingGeometryOutput) -> None:
    peers: list[Polygon] = []
    for index, zone in enumerate(output.zones, start=1):
        pts = [{"x": p.x, "y": p.y} for p in zone.polygon]
        holes = [[{"x": p.x, "y": p.y} for p in ring] for ring in zone.holes]
        for point in [*pts, *(p for ring in holes for p in ring)]:
            if not (0 <= point["x"] <= output.source_width_px and 0 <= point["y"] <= output.source_height_px):
                raise RuntimeError(f"Ceiling zone {index} has coordinates outside the exact source crop")
        poly = Polygon([(p["x"], p["y"]) for p in pts], [[(p["x"], p["y"]) for p in ring] for ring in holes])
        if poly.is_empty or poly.area <= 1 or not poly.is_valid:
            raise RuntimeError(f"Ceiling zone {index} is empty/self-intersecting or has invalid holes")
        for other in peers:
            overlap = poly.intersection(other).area
            if overlap > max(4.0, min(poly.area, other.area) * 0.005):
                raise RuntimeError("Ceiling zones materially overlap; result rejected instead of double-counting")
        peers.append(poly)
    for excluded in output.exclusions:
        epts = [{"x": p.x, "y": p.y} for p in excluded.polygon]
        epoly = Polygon([(p["x"], p["y"]) for p in epts])
        for zone_poly in peers:
            if epoly.intersection(zone_poly).area > max(4.0, epoly.area * 0.01):
                raise RuntimeError(
                    f"Ceiling exclusion '{excluded.name}' overlaps a measured ceiling zone. Return it as a hole or split the zone; result rejected."
                )


def _points(value: Any) -> list[dict[str, float]]:
    if isinstance(value, dict):
        value = value.get("points") or value.get("polygon") or []
    result: list[dict[str, float]] = []
    for item in value or []:
        if isinstance(item, dict) and "x" in item and "y" in item:
            result.append({"x": float(item["x"]), "y": float(item["y"])})
    return result


def _normalize(value: str | None) -> str:
    text = re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()
    synonyms = {
        "toilet": "bathroom", "toilets": "bathroom", "wc": "bathroom", "washroom": "bathroom",
        "bed room": "bedroom", "bedrooms": "bedroom", "common corridor": "corridor",
        "common corridors": "corridor", "entrance lobby": "lobby", "lift lobby": "lobby",
        "apartment balcony": "balcony", "apartment balconies": "balcony", "roof terraces": "roof terrace",
        "parking driveway": "parking", "ground floor parking": "parking", "stairs and landings": "stair",
        "electrical room": "plant room", "panel room": "plant room", "plant rooms": "plant room",
    }
    return synonyms.get(text, text)


def _rule_matches(room_type: str | None, values: list[str]) -> bool:
    room = _normalize(room_type)
    for value in values:
        candidate = _normalize(value)
        if candidate and (room == candidate or room in candidate or candidate in room):
            return True
    return False


def _source_text(evidence: Any) -> str:
    if isinstance(evidence, list):
        for item in evidence:
            if isinstance(item, dict) and item.get("text"):
                return str(item["text"])
    return ""


def _start_run(project_id: str, floor_id: str | None, task: str, model: str | None, request_hash: str) -> str:
    settings = get_settings()
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO takeoff_analysis_run(project_id,floor_id,module,task_type,provider,model_id,prompt_version,
                   status,progress,message,request_hash)
               VALUES (%s,%s,'ceiling',%s,%s,%s,'ceiling-v1','running',5,%s,%s) RETURNING id""",
            (project_id, floor_id, task, settings.takeoff_ai_provider, model, "Starting ceiling analysis", request_hash),
        ).fetchone()
    return str(row["id"])


def _finish_run(run_id: str, status: str, message: str, *, result: Any = None, error: str | None = None) -> None:
    with transaction() as conn:
        conn.execute(
            """UPDATE takeoff_analysis_run SET status=%s,progress=100,message=%s,result_json=%s,error_message=%s,
                   updated_at=now() WHERE id=%s""",
            (status, message, Jsonb(result) if result is not None else None, error, run_id),
        )


def _upsert_catalog(project_id: str, catalog: CeilingCatalogOutput) -> dict[str, str]:
    ids: dict[str, str] = {}
    with transaction() as conn:
        for index, definition in enumerate(catalog.definitions):
            code = definition.code.strip()
            row = conn.execute(
                """INSERT INTO ceiling_definition(project_id,code,name,description,system_type,material,finish,thickness_mm,
                       suspension_system,moisture_rating,display_colour,source_evidence,confidence,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
                   ON CONFLICT(project_id,code) DO UPDATE SET name=excluded.name,description=excluded.description,
                       system_type=excluded.system_type,material=excluded.material,finish=excluded.finish,
                       thickness_mm=excluded.thickness_mm,suspension_system=excluded.suspension_system,
                       moisture_rating=excluded.moisture_rating,source_evidence=excluded.source_evidence,
                       confidence=excluded.confidence,updated_at=now() RETURNING id""",
                (project_id, code, definition.name, definition.description, definition.system_type, definition.material,
                 definition.finish, definition.thickness_mm, definition.suspension_system, definition.moisture_rating,
                 PALETTE[index % len(PALETTE)], Jsonb([{"kind": "specification", "text": definition.source_text}]),
                 definition.confidence),
            ).fetchone()
            ids[code.lower()] = str(row["id"])
        # Always provide a real persisted review family so the unchanged demo UI can represent unresolved zones.
        row = conn.execute(
            """INSERT INTO ceiling_definition(project_id,code,name,description,system_type,display_colour,source_evidence,
                   confidence,status)
               VALUES (%s,'UNASSIGNED','Unassigned ceiling — review required','No supported finish rule has been confirmed yet',
                       'other','#64748b','[]'::jsonb,0,'active')
               ON CONFLICT(project_id,code) DO UPDATE SET updated_at=now() RETURNING id""",
            (project_id,),
        ).fetchone()
        ids["unassigned"] = str(row["id"])
    return ids


def _resolve_definition(room_type: str | None, visible_code: str | None, catalog: CeilingCatalogOutput,
                        ids: dict[str, str]) -> tuple[str, str, float, str | None]:
    if visible_code and visible_code.lower() in ids:
        return ids[visible_code.lower()], "drawing_tag", 0.98, visible_code
    for rule in catalog.room_rules:
        if _rule_matches(room_type, rule.room_types) and rule.ceiling_code.lower() in ids:
            return ids[rule.ceiling_code.lower()], "spec_room_rule", rule.confidence, rule.ceiling_code
    return ids["unassigned"], "unassigned", 0.0, None


def _find_rcp_for_floor(project_id: str, floor: dict[str, Any]) -> dict[str, Any] | None:
    """Return the RCP selected by Ceiling Scope for this floor, if the route is ceiling_drawing."""
    from .scope.engine import get_scope

    storey_id = str(floor.get("storey_id") or "")
    if not storey_id:
        return None
    scope = get_scope(project_id, "ceiling", auto_run=True)
    level_scope = next((item for item in (scope.get("level_scopes") or []) if str(item.get("level_ref") or "") == storey_id), None)
    if not level_scope or level_scope.get("geometry_route") != "drawing":
        return None
    primary_ids = level_scope.get("primary_viewport_ids") or []
    if not primary_ids:
        return None
    return fetch_one(
        """SELECT v.*,s.title,p.page_number FROM viewport v
           JOIN sheet s ON s.id=v.sheet_id JOIN page p ON p.id=s.page_id
           WHERE v.id=%s""",
        (str(primary_ids[0]),),
    )


def _section_observations(project_id: str, quality: str) -> list[dict[str, Any]]:
    existing = fetch_all(
        "SELECT metadata FROM takeoff_evidence WHERE project_id=%s AND module='ceiling' AND evidence_type='section_observation' ORDER BY created_at",
        (project_id,),
    )
    if existing:
        return [row["metadata"] for row in existing if row.get("metadata")]
    from .scope.engine import get_scope

    scope = get_scope(project_id, "ceiling", auto_run=True)
    section_ids = [
        row["viewport_id"] for row in (scope.get("selected_viewports") or [])
        if row.get("role") == "supporting_vertical"
    ][:3]
    sections = fetch_all(
        """SELECT v.id,v.name,v.level_label,s.title,p.page_number FROM viewport v
           JOIN sheet s ON s.id=v.sheet_id JOIN page p ON p.id=s.page_id
           WHERE v.id = ANY(%s::uuid[])
           ORDER BY CASE WHEN v.view_kind='section' THEN 0 ELSE 1 END,p.page_number""",
        (section_ids,),
    ) if section_ids else []
    if not sections:
        return []
    model = model_for_quality(quality)
    client = get_model_client("takeoff")
    storeys = fetch_all("SELECT name,level_index,height_mm FROM storey WHERE project_id=%s ORDER BY level_index", (project_id,))
    observations: list[dict[str, Any]] = []
    for section in sections:
        try:
            image, _ = ensure_viewport_crop(section["id"])
            words = extract_viewport_text(section["id"], max_items=550)
            output = client.parse_image(
                image,
                SECTION_PROMPT.format(
                    storeys="; ".join(f"{s['level_index']}: {s['name']} ({s.get('height_mm') or '?'} mm)" for s in storeys),
                    context="\n".join(f"{w['text']} @ {w['bbox']}" for w in words),
                ),
                SectionObservationOutput,
                system=SECTION_SYSTEM,
                model=model,
            )
            with transaction() as conn:
                for observation in output.observations:
                    data = observation.model_dump()
                    data["source_viewport_id"] = str(section["id"])
                    data["source_name"] = section.get("name") or section.get("title")
                    observations.append(data)
                    conn.execute(
                        """INSERT INTO takeoff_evidence(project_id,module,evidence_type,source_viewport_id,source_text,
                               geometry,confidence,metadata)
                           VALUES (%s,'ceiling','section_observation',%s,%s,%s,%s,%s)""",
                        (project_id, str(section["id"]), observation.observation_type,
                         Jsonb(observation.evidence[0].bbox if observation.evidence and observation.evidence[0].bbox else None),
                         observation.confidence, Jsonb(data)),
                    )
        except Exception:
            # Section evidence is an enhancement. Failure must not destroy valid plan-derived ceilings.
            continue
    return observations


def _observation_for(room_type: str | None, floor_name: str, observations: list[dict[str, Any]]) -> dict[str, Any] | None:
    room = _normalize(room_type)
    level = _normalize(floor_name)
    best: tuple[int, dict[str, Any]] | None = None
    for obs in observations:
        score = 0
        obs_room = _normalize(obs.get("room_label"))
        obs_level = _normalize(obs.get("level_label"))
        room_match = bool(room and obs_room and (room in obs_room or obs_room in room))
        # A level-only section note is evidence, not enough to assign a special ceiling
        # condition to every room on the storey. Stair soffits are the one safe semantic match.
        if room_match:
            score += 4
        elif obs.get("observation_type") == "stair_soffit" and "stair" in room:
            score += 4
        else:
            continue
        if level and obs_level and (level in obs_level or obs_level in level):
            score += 3
        if best is None or score > best[0]:
            best = (score, obs)
    return best[1] if best else None


def _profile_from_observation(observation: dict[str, Any] | None) -> tuple[str, dict[str, Any]]:
    if not observation:
        return "flat", {}
    mapping = {
        "sloped_ceiling": "sloped", "bulkhead": "dropped", "double_height": "double_height",
        "stair_soffit": "stair_soffit", "dropped_ceiling": "dropped", "vaulted_ceiling": "vaulted",
        "no_ceiling": "no_ceiling",
    }
    profile = mapping.get(observation.get("observation_type"), "unknown_special")
    return profile, {
        "high_level_text": observation.get("high_level_text"), "low_level_text": observation.get("low_level_text"),
        "height_text": observation.get("height_text"), "slope_direction_text": observation.get("slope_direction_text"),
        "section_evidence": observation,
    }


def _derive_from_floor_spaces(project_id: str, floor: dict[str, Any], catalog: CeilingCatalogOutput,
                              def_ids: dict[str, str], observations: list[dict[str, Any]]) -> int:
    spaces = fetch_all("SELECT * FROM floor_space WHERE floor_id=%s AND excluded=false AND user_confirmed=true ORDER BY friendly_number", (str(floor["id"]),))
    if not spaces:
        raise RuntimeError("Floor geometry is required before deriving ceilings when no reflected ceiling plan exists.")
    count = 0
    with transaction() as conn:
        confirmed = conn.execute("SELECT count(*) AS n FROM ceiling_zone WHERE floor_id=%s AND user_confirmed=true", (str(floor["id"]),)).fetchone()["n"]
        if confirmed:
            raise RuntimeError("This floor has user-confirmed ceiling zones. AI/derivation will not overwrite them.")
        conn.execute("DELETE FROM ceiling_zone WHERE floor_id=%s", (str(floor["id"]),))
        for index, space in enumerate(spaces, start=1):
            geometry = space.get("geometry") or {}
            pts = _points(geometry)
            holes = [[{"x": float(p["x"]), "y": float(p["y"])} for p in ring] for ring in (geometry.get("deducts") or [])]
            if len(pts) < 3:
                continue
            room_type = space.get("room_type") or space.get("name")
            definition_id, method, confidence, code = _resolve_definition(room_type, None, catalog, def_ids)
            definition = conn.execute("SELECT * FROM ceiling_definition WHERE id=%s", (definition_id,)).fetchone()
            observation = _observation_for(room_type, floor["name"], observations)
            profile_type, profile = _profile_from_observation(observation)
            if definition and definition.get("system_type") == "no_ceiling":
                profile_type = "no_ceiling"
            # For external/open FloorSpaces, absence of supported ceiling evidence is
            # not permission to invent a soffit. Balconies/parking with an explicit C-code
            # still resolve normally; an unassigned external terrace stays no-ceiling.
            if method == "unassigned" and space.get("environment") != "internal":
                profile_type = "no_ceiling"
                profile["reason"] = "No supported ceiling/soffit evidence for external/open floor space"
            include = profile_type not in {"no_ceiling", "open_to_sky"}
            mmpp = float(floor["mm_per_pixel"]) if floor.get("mm_per_pixel") else None
            outer_area = area_m2(pts, mmpp)
            deduction = sum((area_m2(ring, mmpp) or 0.0) for ring in holes)
            gross = round(max(0.0, (outer_area or 0.0) - deduction), 4) if outer_area is not None else None
            surface = gross if profile_type in {"flat", "exposed_soffit", "external_soffit", "dropped"} else None
            row = conn.execute(
                """INSERT INTO ceiling_zone(project_id,floor_id,zone_number,name,geometry,geometry_source,profile_type,profile,
                       gross_area_m2,deduction_area_m2,net_area_m2,surface_area_m2,include_in_boq,status,user_confirmed,confidence,definition_id,
                       drawing_tag,assignment_method,assignment_confidence,assignment_status,assignment_confirmed,room_links,evidence)
                   VALUES (%s,%s,%s,%s,%s,'floor_space',%s,%s,%s,%s,%s,%s,%s,'needs_review',false,%s,%s,%s,%s,%s,%s,false,%s,%s)
                   RETURNING id""",
                (project_id, str(floor["id"]), f"CZ-{int(floor['level_index']):02d}-{index:03d}",
                 space.get("name") or room_type or "Ceiling", Jsonb({"points": pts, "deducts": holes}), profile_type, Jsonb(profile),
                 outer_area, deduction, gross, surface, include, confidence, definition_id, code, method, confidence,
                 "suggested" if code else "unassigned", Jsonb([str(space["id"])]),
                 Jsonb([{"kind": "derived_from_confirmed_floor_space", "room_id": str(space["id"]), "confidence": space.get("confidence")}] +
                       ([{"kind": "section", "observation": observation}] if observation else []))),
            ).fetchone()
            count += 1
        conn.execute(
            "UPDATE takeoff_floor SET ceiling_version=ceiling_version+1,analysis_status='ceiling_ready',updated_at=now() WHERE id=%s",
            (str(floor["id"]),),
        )
    return count


def _analyze_rcp(project_id: str, floor: dict[str, Any], rcp: dict[str, Any], quality: str,
                 catalog: CeilingCatalogOutput, def_ids: dict[str, str]) -> int:
    image, ctx = ensure_viewport_crop(rcp["id"])
    mmpp, verified = source_mm_per_pixel(rcp["id"])
    if not verified or not mmpp:
        raise RuntimeError(f"Reflected ceiling plan '{rcp.get('name') or rcp.get('title')}' needs a confirmed scale in Pre.")
    words = extract_viewport_text(rcp["id"])
    rooms = fetch_all("SELECT id,name,room_type,geometry FROM floor_space WHERE floor_id=%s AND excluded=false", (str(floor["id"]),))
    room_context = "\n".join(f"{r.get('name') or r.get('room_type')} | {r.get('geometry')}" for r in rooms[:100])
    model = model_for_quality(quality)
    output = get_model_client("takeoff").parse_image(
        image,
        CEILING_GEOMETRY_PROMPT.format(
            width=ctx["crop_width_px"], height=ctx["crop_height_px"], floor_name=floor["name"], rooms=room_context,
            context="\n".join(f"{x['text']} @ {x['bbox']}" for x in words),
        ),
        CeilingGeometryOutput,
        system=CEILING_SYSTEM,
        model=model,
    )
    if output.source_width_px != ctx["crop_width_px"] or output.source_height_px != ctx["crop_height_px"]:
        raise RuntimeError("Ceiling AI coordinate space does not match the exact RCP crop; result rejected.")
    _validate_ceiling_geometry(output)
    with transaction() as conn:
        confirmed = conn.execute("SELECT count(*) AS n FROM ceiling_zone WHERE floor_id=%s AND user_confirmed=true", (str(floor["id"]),)).fetchone()["n"]
        if confirmed:
            raise RuntimeError("This floor has user-confirmed ceiling zones. Analysis will not overwrite them.")
        conn.execute("DELETE FROM ceiling_zone WHERE floor_id=%s", (str(floor["id"]),))
        count = 0
        for index, zone in enumerate(output.zones, start=1):
            pts = [{"x": p.x, "y": p.y} for p in zone.polygon]
            holes = [[{"x": p.x, "y": p.y} for p in ring] for ring in zone.holes]
            visible_code = zone.finish_evidence.code if zone.finish_evidence else None
            room_type = zone.room_labels[0] if zone.room_labels else zone.name
            definition_id, method, confidence, code = _resolve_definition(room_type, visible_code, catalog, def_ids)
            include = zone.special_type not in {"no_ceiling", "open_to_sky"}
            outer_area = area_m2(pts, mmpp)
            deduction = sum((area_m2(ring, mmpp) or 0.0) for ring in holes)
            gross = round(max(0.0, (outer_area or 0.0) - deduction), 4) if outer_area is not None else None
            surface = gross if zone.special_type in {"flat", "exposed_soffit", "external_soffit", "dropped"} else None
            profile = {
                "source_viewport_id": str(rcp["id"]), "ceiling_level_text": zone.ceiling_level_text,
                "high_level_text": zone.high_level_text, "low_level_text": zone.low_level_text,
                "slope_direction_degrees": zone.slope_direction_degrees,
            }
            evidence = [e.model_dump() for e in zone.evidence]
            if zone.finish_evidence:
                evidence.extend(e.model_dump() for e in zone.finish_evidence.evidence)
            conn.execute(
                """INSERT INTO ceiling_zone(project_id,floor_id,zone_number,name,geometry,geometry_source,profile_type,profile,
                       gross_area_m2,deduction_area_m2,net_area_m2,surface_area_m2,include_in_boq,status,user_confirmed,confidence,definition_id,
                       drawing_tag,assignment_method,assignment_confidence,assignment_status,room_links,evidence)
                   VALUES (%s,%s,%s,%s,%s,'rcp',%s,%s,%s,%s,%s,%s,%s,'needs_review',false,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (project_id, str(floor["id"]), f"CZ-{int(floor['level_index']):02d}-{index:03d}", zone.name or "Ceiling zone",
                 Jsonb({"points": pts, "deducts": holes}), zone.special_type, Jsonb(profile), outer_area, deduction, gross, surface, include,
                 zone.confidence, definition_id, code, method, confidence, "suggested" if code else "unassigned",
                 Jsonb(zone.room_labels), Jsonb(evidence)),
            )
            count += 1
        for feature in output.features:
            geom = {}
            if feature.polygon:
                geom["points"] = [{"x": p.x, "y": p.y} for p in feature.polygon]
            if feature.line:
                geom["line"] = [{"x": p.x, "y": p.y} for p in feature.line]
            qty = area_m2(geom.get("points", []), mmpp) if geom.get("points") else None
            conn.execute(
                """INSERT INTO ceiling_feature(project_id,floor_id,feature_type,name,geometry,measurement_basis,gross_quantity,
                       net_quantity,measurement_unit,width_mm,height_mm,depth_mm,status,user_confirmed,confidence,evidence)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'needs_review',false,%s,%s)""",
                (project_id, str(floor["id"]), feature.feature_type, feature.name, Jsonb(geom),
                 "area" if geom.get("points") else "item", qty, qty, "m²" if geom.get("points") else "nr",
                 feature.width_mm, feature.height_mm, feature.depth_mm, feature.confidence,
                 Jsonb([e.model_dump() for e in feature.evidence])),
            )
        conn.execute("UPDATE takeoff_floor SET ceiling_version=ceiling_version+1,analysis_status='ceiling_ready',updated_at=now() WHERE id=%s", (str(floor["id"]),))
    return count


def analyze_project_ceilings(project_id: UUID | str, quality: str = "medium") -> dict[str, Any]:
    from .scope.engine import get_scope

    pid = str(project_id)
    require_frozen_project(pid)
    scope = get_scope(pid, "ceiling", auto_run=True)
    if scope.get("status") == "blocked":
        first = next((gap.get("message") for gap in scope.get("coverage_gaps", []) if gap.get("severity") == "blocked"), "Ceiling Scope is blocked")
        raise RuntimeError(f"Ceiling Scope is not ready: {first}")
    floors = ensure_takeoff_floors(pid)
    if not floors:
        raise RuntimeError("No Takeoff floors available. Complete Pre Plans/Scale/Height first.")
    # Floor geometry is the controlled fallback source when there is no RCP.
    floor_count = fetch_one("SELECT count(*) AS n FROM floor_space WHERE project_id=%s", (pid,))
    if not floor_count or int(floor_count["n"]) == 0:
        raise RuntimeError("Run Floor detection first. Ceiling reuses confirmed FloorSpace geometry when no reflected ceiling plan exists.")
    pending_floor_review = fetch_one(
        "SELECT count(*) AS n FROM floor_space WHERE project_id=%s AND excluded=false AND user_confirmed=false",
        (pid,),
    )
    if pending_floor_review and int(pending_floor_review["n"]) > 0:
        raise RuntimeError(
            "Confirm the detected Floor zones in Floor → Dimension before Ceiling analysis. "
            "Ceiling will not silently build from unreviewed FloorSpace geometry."
        )
    model = model_for_quality(quality)
    run_id = _start_run(pid, None, "geometry_and_finish", model, content_hash({"project": pid, "quality": quality, "task": "ceiling"}))
    try:
        specs = project_text_evidence(pid)
        catalog = CeilingCatalogOutput()
        if specs.strip():
            catalog = get_model_client("takeoff").parse_text(
                CEILING_CATALOG_PROMPT.format(spec_text=specs), CeilingCatalogOutput,
                system=CEILING_CATALOG_SYSTEM, model=model,
            )
        def_ids = _upsert_catalog(pid, catalog)
        observations: list[dict[str, Any]] = []
        # Only section-analyse when at least one floor has no dedicated RCP.
        if any(_find_rcp_for_floor(pid, floor) is None for floor in floors):
            observations = _section_observations(pid, quality)
        results = []
        for floor in floors:
            existing = fetch_one("SELECT count(*) AS n FROM ceiling_zone WHERE floor_id=%s", (str(floor["id"]),))
            if existing and int(existing["n"]) > 0:
                results.append({"floor_id": str(floor["id"]), "skipped": True, "reason": "existing ceiling zones"})
                continue
            rcp = _find_rcp_for_floor(pid, floor)
            if rcp:
                count = _analyze_rcp(pid, floor, rcp, quality, catalog, def_ids)
                results.append({"floor_id": str(floor["id"]), "source": "rcp", "zones": count, "viewport_id": str(rcp["id"])})
            else:
                count = _derive_from_floor_spaces(pid, floor, catalog, def_ids, observations)
                results.append({"floor_id": str(floor["id"]), "source": "floor_space", "zones": count})
        result = {"floors": results, "warnings": catalog.warnings, "section_observations": len(observations)}
        _finish_run(run_id, "completed", "Ceiling analysis complete", result=result)
        return result
    except Exception as exc:
        _finish_run(run_id, "failed", "Ceiling analysis failed", error=str(exc))
        raise


def _ceiling_extra_viewports(project_id: str, context: dict[str, Any]) -> None:
    known = {str(v["id"]) for v in context["viewports"]}
    floors = context.get("floors") or []
    for floor in floors:
        rcp = _find_rcp_for_floor(project_id, floor)
        if not rcp or str(rcp["id"]) in known:
            continue
        try:
            _, crop = ensure_viewport_crop(rcp["id"])
        except Exception:
            continue
        mmpp, _ = source_mm_per_pixel(rcp["id"])
        sid = f"ceiling-sheet-{rcp['id']}"
        context["sheets"].append({
            "id": sid, "sheetNo": str(rcp.get("page_number") or ""), "title": rcp.get("title") or rcp.get("name") or "Ceiling plan",
            "revision": "", "image": f"/api/v1/viewports/{rcp['id']}/crop", "page": 200 + int(rcp.get("page_number") or 0),
            "included": True, "width": crop["crop_width_px"], "height": crop["crop_height_px"],
        })
        context["viewports"].append({
            "id": str(rcp["id"]), "name": rcp.get("name") or rcp.get("title") or "Ceiling plan", "category": "plan", "sheetId": sid,
            "bbox": [0, 0, crop["crop_width_px"], crop["crop_height_px"]], "status": "confirmed",
            "scaleMPerPx": (float(mmpp) / 1000.0) if mmpp else None,
        })
        known.add(str(rcp["id"]))


def ceiling_demo_state(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    context = viewport_demo_context(pid)
    _ceiling_extra_viewports(pid, context)
    defs = fetch_all("SELECT * FROM ceiling_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code NULLS LAST,name", (pid,))
    families = [{
        "id": str(d["id"]), "kind": "ceiling", "mark": d.get("code") or "C?", "description": d.get("description") or d["name"],
        "material": d.get("material") or d.get("finish") or d.get("system_type") or "", "thicknessMm": d.get("thickness_mm"),
        "screed": d.get("suspension_system") or "", "falls": "", "source": _source_text(d.get("source_evidence")) or "Project specification / user",
        "color": d.get("display_colour") or "#64748b",
    } for d in defs]
    rows = fetch_all(
        """SELECT z.*,f.viewport_id AS floor_viewport_id FROM ceiling_zone z JOIN takeoff_floor f ON f.id=z.floor_id
           WHERE z.project_id=%s AND z.include_in_boq=true ORDER BY f.level_index,z.zone_number""", (pid,)
    )
    zones = []
    fallback_family = next((f["id"] for f in families if f["mark"] == "UNASSIGNED"), families[0]["id"] if families else "")
    for row in rows:
        if not fallback_family and not row.get("definition_id"):
            continue
        profile = row.get("profile") or {}
        zones.append({
            "id": str(row["id"]), "kind": "ceiling", "familyId": str(row.get("definition_id") or fallback_family),
            "floorId": str(row["floor_id"]), "viewportId": str(profile.get("source_viewport_id") or row["floor_viewport_id"]),
            "points": _points(row.get("geometry") or {}), "deducts": (row.get("geometry") or {}).get("deducts") or [],
            "room": row.get("name") or "Ceiling zone",
            "status": "confirmed" if row.get("user_confirmed") else "needs_review" if row.get("status") == "needs_review" else "ready",
        })
    ui = fetch_one("SELECT state_json FROM takeoff_ui_state WHERE project_id=%s AND module='ceiling'", (pid,))
    run = fetch_one("SELECT status,progress,message,error_message FROM takeoff_analysis_run WHERE project_id=%s AND module='ceiling' ORDER BY created_at DESC LIMIT 1", (pid,))
    return {**context, "families": families, "zones": zones, "uiState": (ui or {}).get("state_json") or {},
            "analysis": run or {"status": "not_started", "progress": 0, "message": None, "error_message": None},
            "provider": get_settings().takeoff_ai_provider}


def save_ceiling_demo_state(project_id: UUID | str, payload: dict[str, Any]) -> dict[str, Any]:
    pid = str(project_id)
    context = viewport_demo_context(pid)
    floors_by_id = {str(f["id"]): f for f in context.get("floors") or []}
    families = payload.get("families") or []
    zones = payload.get("zones") or []
    id_map: dict[str, str] = {}
    with transaction() as conn:
        for index, family in enumerate(families):
            client_id = str(family.get("id") or "")
            code = str(family.get("mark") or f"C-{index+1:02d}").strip()
            existing = None
            try:
                existing = conn.execute("SELECT id FROM ceiling_definition WHERE id=%s AND project_id=%s", (client_id, pid)).fetchone()
            except Exception:
                existing = None
            if existing:
                dbid = str(existing["id"])
                conn.execute(
                    """UPDATE ceiling_definition SET code=%s,name=%s,description=%s,material=%s,thickness_mm=%s,
                           suspension_system=%s,display_colour=%s,source_evidence=%s,updated_at=now() WHERE id=%s""",
                    (code, family.get("description") or code, family.get("description"), family.get("material"),
                     family.get("thicknessMm"), family.get("screed"), family.get("color") or PALETTE[index % len(PALETTE)],
                     Jsonb([{"kind": "user", "text": family.get("source") or "Edited in Quanto"}]), dbid),
                )
            else:
                row = conn.execute(
                    """INSERT INTO ceiling_definition(project_id,code,name,description,system_type,material,thickness_mm,
                           suspension_system,display_colour,source_evidence,confidence,status)
                       VALUES (%s,%s,%s,%s,'other',%s,%s,%s,%s,%s,1,'active')
                       ON CONFLICT(project_id,code) DO UPDATE SET name=excluded.name,description=excluded.description,
                           material=excluded.material,thickness_mm=excluded.thickness_mm,suspension_system=excluded.suspension_system,
                           display_colour=excluded.display_colour,source_evidence=excluded.source_evidence,updated_at=now() RETURNING id""",
                    (pid, code, family.get("description") or code, family.get("description"), family.get("material"),
                     family.get("thicknessMm"), family.get("screed"), family.get("color") or PALETTE[index % len(PALETTE)],
                     Jsonb([{"kind": "user", "text": family.get("source") or "Edited in Quanto"}])),
                ).fetchone()
                dbid = str(row["id"])
            id_map[client_id] = dbid

        existing_ids = {str(r["id"]) for r in conn.execute("SELECT id FROM ceiling_zone WHERE project_id=%s AND include_in_boq=true", (pid,)).fetchall()}
        incoming: set[str] = set()
        for index, zone in enumerate(zones):
            floor_id = str(zone.get("floorId") or "")
            floor = floors_by_id.get(floor_id)
            if not floor:
                continue
            pts = _points(zone.get("points") or [])
            if len(pts) < 3:
                continue
            viewport_id = str(zone.get("viewportId") or floor["viewport_id"])
            mmpp, _ = source_mm_per_pixel(viewport_id)
            if not mmpp:
                mmpp = float(floor["mm_per_pixel"]) if floor.get("mm_per_pixel") else None
            deducts = [[{"x": float(p["x"]), "y": float(p["y"])} for p in ring] for ring in (zone.get("deducts") or [])]
            gross = area_m2(pts, mmpp)
            deduction = sum((area_m2(ring, mmpp) or 0) for ring in deducts)
            net = round(max(0.0, (gross or 0) - deduction), 4) if gross is not None else None
            family_id = id_map.get(str(zone.get("familyId")), str(zone.get("familyId") or "")) or None
            client_id = str(zone.get("id") or "")
            existing = None
            try:
                existing = conn.execute("SELECT * FROM ceiling_zone WHERE id=%s AND project_id=%s", (client_id, pid)).fetchone()
            except Exception:
                existing = None
            confirmed = zone.get("status") == "confirmed"
            profile = dict((existing or {}).get("profile") or {})
            profile["source_viewport_id"] = viewport_id
            if existing:
                zid = str(existing["id"])
                conn.execute(
                    """UPDATE ceiling_zone SET name=%s,geometry=%s,profile=%s,gross_area_m2=%s,deduction_area_m2=%s,
                           net_area_m2=%s,surface_area_m2=CASE WHEN profile_type IN ('flat','exposed_soffit','external_soffit','dropped') THEN %s ELSE surface_area_m2 END,
                           definition_id=%s,status=%s,user_confirmed=%s,assignment_method='user',assignment_confidence=1,
                           assignment_status=%s,assignment_confirmed=%s,updated_at=now() WHERE id=%s""",
                    (zone.get("room") or "Ceiling zone", Jsonb({"points": pts, "deducts": deducts}), Jsonb(profile), gross,
                     deduction, net, net, family_id, "confirmed" if confirmed else "needs_review", confirmed,
                     "confirmed" if confirmed else "suggested", confirmed, zid),
                )
            else:
                row = conn.execute(
                    """INSERT INTO ceiling_zone(project_id,floor_id,zone_number,name,geometry,geometry_source,profile_type,profile,
                           gross_area_m2,deduction_area_m2,net_area_m2,surface_area_m2,include_in_boq,status,user_confirmed,
                           confidence,definition_id,assignment_method,assignment_confidence,assignment_status,assignment_confirmed,evidence)
                       VALUES (%s,%s,%s,%s,%s,'user','flat',%s,%s,%s,%s,%s,true,%s,%s,1,%s,'user',1,%s,%s,%s) RETURNING id""",
                    (pid, floor_id, f"MCZ-{int(floor['level_index']):02d}-{index+1:03d}", zone.get("room") or "Ceiling zone",
                     Jsonb({"points": pts, "deducts": deducts}), Jsonb(profile), gross, deduction, net, net,
                     "confirmed" if confirmed else "needs_review", confirmed, family_id,
                     "confirmed" if confirmed else "suggested", confirmed,
                     Jsonb([{"kind": "user", "text": "Manually drawn/edited in Quanto"}])),
                ).fetchone()
                zid = str(row["id"])
            incoming.add(zid)
        for deleted in existing_ids - incoming:
            row = conn.execute("SELECT user_confirmed FROM ceiling_zone WHERE id=%s", (deleted,)).fetchone()
            if row and not row["user_confirmed"]:
                conn.execute("DELETE FROM ceiling_zone WHERE id=%s", (deleted,))
        conn.execute(
            """INSERT INTO takeoff_ui_state(project_id,module,state_json,updated_at) VALUES (%s,'ceiling',%s,now())
               ON CONFLICT(project_id,module) DO UPDATE SET state_json=excluded.state_json,updated_at=now()""",
            (pid, Jsonb(payload.get("uiState") or {})),
        )
    return ceiling_demo_state(pid)
