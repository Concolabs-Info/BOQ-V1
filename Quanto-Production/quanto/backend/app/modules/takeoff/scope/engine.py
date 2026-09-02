from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from typing import Any

from ....database.connection import fetch_all, fetch_one, transaction
from ....database.json_value import Jsonb
from .models import ElementScopeSpec, FactDependency
from .questions import answered_choice, list_questions, sync_questions
from .registry import canonical_element, get_scope_spec

SCOPE_SCHEMA_VERSION = "takeoff-scope-v2"


def _norm(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _level_norm(value: Any) -> str:
    value = re.sub(r"\b(plan|layout|general arrangement|ga|level)\b", " ", _norm(value))
    return " ".join(value.split())


def _hash(payload: Any) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str, ensure_ascii=False).encode("utf-8")).hexdigest()


def _load_frame(project_id: str) -> tuple[dict[str, Any], int]:
    project = fetch_one("SELECT pre_status,pre_frame,frame_version FROM project WHERE id=%s", (project_id,))
    if not project:
        raise ValueError("Project not found")
    if project["pre_status"] != "frozen" or not project.get("pre_frame"):
        raise RuntimeError("Complete Pre and freeze the Project Frame before Takeoff Scope can run.")
    frame = project["pre_frame"]
    version = int(frame.get("frame_version") or project.get("frame_version") or 0)
    return frame, version


def _viewport_text(vp: dict[str, Any], sheets: dict[str, dict[str, Any]]) -> str:
    sheet = sheets.get(str(vp.get("sheet_id"))) or {}
    return " ".join(
        str(x or "") for x in (vp.get("name"), vp.get("level_label"), sheet.get("sheet_no"), sheet.get("title"), vp.get("why"))
    )


def _subjects(vp: dict[str, Any]) -> set[str]:
    return {str(value).lower() for value in (vp.get("subjects") or [])}


def _subject_match(vp: dict[str, Any], wanted: tuple[str, ...]) -> bool:
    return bool(_subjects(vp).intersection(wanted))


def _discipline_match(vp: dict[str, Any], wanted: tuple[str, ...]) -> bool:
    if not wanted:
        return True
    return str(vp.get("discipline") or "").lower() in wanted


def _legacy_match(vp: dict[str, Any], spec: ElementScopeSpec, sheets: dict[str, dict[str, Any]]) -> bool:
    if not spec.legacy_name_patterns:
        return False
    text = _viewport_text(vp, sheets).lower()
    return any(pattern.lower() in text for pattern in spec.legacy_name_patterns)


def _scale_status(vp: dict[str, Any]) -> dict[str, Any]:
    factor = vp.get("scale_factor")
    fit_id = vp.get("scale_fit_id")
    factor_x = vp.get("scale_factor_x")
    factor_y = vp.get("scale_factor_y")
    confirmed = bool(fit_id and (factor is not None or factor_x is not None or factor_y is not None))
    return {
        "status": "confirmed" if confirmed else "locked",
        "scale_fit_id": str(fit_id) if fit_id else None,
        "factor": float(factor) if factor is not None else None,
        "factor_x": float(factor_x) if factor_x is not None else None,
        "factor_y": float(factor_y) if factor_y is not None else None,
    }


def _matching_levels(vp: dict[str, Any], levels: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return every confirmed level a trusted Pre viewport explicitly applies to.

    A typical plan can legitimately be the source viewport for several storeys, so Scope must
    preserve that confirmed reuse rather than attaching the viewport to only the first match.
    """
    vid = str(vp.get("id"))
    by_source = [level for level in levels if str(level.get("source_viewport_id") or "") == vid]
    if by_source:
        return by_source

    label = _level_norm(vp.get("level_label"))
    if not label:
        return []

    by_name = [level for level in levels if _level_norm(level.get("name")) == label]
    if by_name:
        return by_name

    by_typical = [level for level in levels if _level_norm(level.get("typical_group")) == label and _level_norm(level.get("typical_group"))]
    if by_typical:
        return by_typical

    contained: list[dict[str, Any]] = []
    for level in levels:
        names = [_level_norm(level.get("name")), _level_norm(level.get("typical_group"))]
        if any(name and len(name) >= 3 and (name in label or label in name) for name in names):
            contained.append(level)
    if len(contained) == 1:
        return contained

    mentions = _mentioned_levels(label, levels)
    if len(mentions) >= 2 and re.search(r"\b(?:up\s*to|upto|through|to)\b", label):
        first = int(mentions[0].get("level_index") or 0)
        last = int(mentions[-1].get("level_index") or 0)
        low, high = sorted((first, last))
        return [level for level in levels if low <= int(level.get("level_index") or 0) <= high]
    return mentions if len(mentions) == 1 else []


_LEVEL_ALIASES = {
    "ground": ("ground", "gf", "g f"),
    "first": ("first", "1st"),
    "second": ("second", "2nd"),
    "third": ("third", "3rd"),
    "fourth": ("fourth", "4th"),
    "fifth": ("fifth", "5th"),
    "sixth": ("sixth", "6th"),
    "seventh": ("seventh", "7th"),
    "eighth": ("eighth", "8th"),
    "ninth": ("ninth", "9th"),
    "tenth": ("tenth", "10th"),
}


def _mentioned_levels(text: str, levels: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return confirmed levels explicitly named by a viewport label, in building order."""
    value = f" {_norm(text)} "
    result: list[dict[str, Any]] = []
    for level in levels:
        name = _norm(level.get("name"))
        aliases = {name}
        for word, equivalents in _LEVEL_ALIASES.items():
            if re.search(rf"\b{re.escape(word)}\b", name):
                aliases.update(name.replace(word, alias) for alias in equivalents)
        if "roof terrace" in name:
            aliases.add("roof terrace")
        if any(alias and re.search(rf"\b{re.escape(alias)}\b", value) for alias in aliases):
            result.append(level)
    return result


def _column_span_levels(vp: dict[str, Any], levels: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map dedicated column-layout ranges to the storeys whose column lift they govern.

    `UP TO FIRST FLOOR` governs the ground-to-first lift. `FIRST FLOOR UP TO ROOF`
    starts above the named lower boundary, so it governs second floor onward.
    """
    label = _norm(vp.get("level_label") or vp.get("name"))
    mentions = _mentioned_levels(label, levels)
    if not mentions:
        return _matching_levels(vp, levels)
    if label.startswith("upto ") or label.startswith("up to "):
        return [mentions[-1]]
    if len(mentions) >= 2 and re.search(r"\b(?:up\s*to|upto|through|to)\b", label):
        first = int(mentions[0].get("level_index") or 0)
        last = int(mentions[-1].get("level_index") or 0)
        low, high = sorted((first, last))
        return [level for level in levels if low < int(level.get("level_index") or 0) <= high]
    return _matching_levels(vp, levels)


def _match_level(vp: dict[str, Any], levels: list[dict[str, Any]]) -> dict[str, Any] | None:
    matches = _matching_levels(vp, levels)
    return matches[0] if len(matches) == 1 else None


def _primary_candidates(frame: dict[str, Any], spec: ElementScopeSpec) -> tuple[list[dict[str, Any]], bool]:
    sheets = {str(row["id"]): row for row in frame.get("sheets") or []}
    candidates: list[dict[str, Any]] = []
    for vp in frame.get("viewports") or []:
        if vp.get("view_kind") not in spec.primary_view_kinds:
            continue
        if not _discipline_match(vp, spec.primary_disciplines):
            continue
        if _subject_match(vp, spec.primary_subjects):
            candidates.append({**vp, "selection_basis": "pre_subject"})
    used_legacy = False
    if not candidates and spec.legacy_name_patterns:
        for vp in frame.get("viewports") or []:
            if vp.get("view_kind") not in spec.primary_view_kinds:
                continue
            if not _discipline_match(vp, spec.primary_disciplines):
                continue
            if _legacy_match(vp, spec, sheets):
                candidates.append({**vp, "selection_basis": "legacy_pre_name"})
                used_legacy = True
    if candidates and spec.prefer_explicit_subject_in_name:
        explicit = [
            vp for vp in candidates
            if any(re.search(rf"\b{re.escape(subject)}s?\b", _norm(vp.get("name"))) for subject in spec.primary_subjects)
        ]
        if explicit:
            candidates = explicit
    return candidates, used_legacy


def _roof_scope_ref(vp: dict[str, Any], level: dict[str, Any] | None, sheets: dict[str, dict[str, Any]]) -> str:
    text = _norm(_viewport_text(vp, sheets))
    kind = "roof_terrace" if "terrace" in text else "canopy" if "canopy" in text else "roof"
    base = str(level["id"]) if level else _level_norm(vp.get("level_label")) or "unmapped"
    return f"{base}:{kind}"


def _foundation_scope_ref(vp: dict[str, Any], spec: ElementScopeSpec, level: dict[str, Any] | None) -> str:
    subjects = _subjects(vp)
    subject = next((value for value in spec.primary_subjects if value in subjects), "foundation")
    return f"{str(level['id']) if level else 'foundation'}:{subject}"


def _group_ref(vp: dict[str, Any], spec: ElementScopeSpec, level: dict[str, Any] | None, sheets: dict[str, dict[str, Any]]) -> str:
    if spec.group_mode == "roof_scope":
        return _roof_scope_ref(vp, level, sheets)
    if spec.group_mode == "foundation_scope":
        return _foundation_scope_ref(vp, spec, level)
    if spec.group_mode == "candidate":
        return str(vp["id"])
    return str(level["id"]) if level else f"unmapped:{vp['id']}"


def _viewport_output(vp: dict[str, Any], role: str, level: dict[str, Any] | None, scope_ref: str, sheets: dict[str, dict[str, Any]]) -> dict[str, Any]:
    sheet = sheets.get(str(vp.get("sheet_id"))) or {}
    return {
        "viewport_id": str(vp["id"]),
        "role": role,
        "level_ref": str(level["id"]) if level else None,
        "scope_ref": scope_ref,
        "name": vp.get("name"),
        "sheet_no": sheet.get("sheet_no"),
        "sheet_title": sheet.get("title"),
        "sheet_revision": sheet.get("revision"),
        "discipline": vp.get("discipline"),
        "view_kind": vp.get("view_kind"),
        "subjects": list(vp.get("subjects") or []),
        "level_label": vp.get("level_label"),
        "bbox_mpt": vp.get("bbox_mpt"),
        "selection_basis": vp.get("selection_basis") or "pre_frame",
        "scale": _scale_status(vp),
    }


def _supporting_viewports(frame: dict[str, Any], spec: ElementScopeSpec, primary_ids: set[str]) -> list[dict[str, Any]]:
    sheets = {str(row["id"]): row for row in frame.get("sheets") or []}
    levels = list(frame.get("levels") or [])
    result: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for vp in frame.get("viewports") or []:
        vid = str(vp["id"])
        if vid in primary_ids:
            continue
        kind = str(vp.get("view_kind") or "")
        role: str | None = None
        if kind in {"section", "elevation"}:
            if spec.require_vertical_evidence or _subject_match(vp, spec.supporting_subjects + spec.primary_subjects):
                role = "supporting_vertical"
        elif kind == "schedule":
            if _subject_match(vp, spec.schedule_subjects + spec.primary_subjects) or any(
                word in _viewport_text(vp, sheets).lower() for word in spec.evidence_keywords
            ):
                role = "supporting_schedule"
        elif kind == "detail":
            if _subject_match(vp, spec.detail_subjects + spec.primary_subjects) or any(
                word in _viewport_text(vp, sheets).lower() for word in spec.evidence_keywords
            ):
                role = "supporting_detail"
        elif kind in {"legend", "notes"} and any(word in _viewport_text(vp, sheets).lower() for word in spec.evidence_keywords):
            role = "supporting_definition"
        elif kind == "plan" and _subject_match(vp, spec.supporting_subjects):
            role = "supporting_attribute"
        if not role:
            continue
        level = _match_level(vp, levels)
        scope_ref = str(level["id"]) if level else "project"
        key = (vid, role)
        if key not in seen:
            result.append(_viewport_output(vp, role, level, scope_ref, sheets))
            seen.add(key)
    return result


def _supporting_specs(frame: dict[str, Any], spec: ElementScopeSpec) -> list[dict[str, Any]]:
    keywords = tuple(word.lower() for word in spec.evidence_keywords)
    result = []
    for item in frame.get("spec_items") or []:
        text = " ".join(str(item.get(key) or "") for key in ("name", "topic", "raw_text")).lower()
        if keywords and not any(word in text for word in keywords):
            continue
        result.append({
            "spec_item_id": str(item["id"]),
            "kind": item.get("kind"),
            "name": item.get("name"),
            "topic": item.get("topic"),
            "viewport_id": str(item["viewport_id"]) if item.get("viewport_id") else None,
        })
    return result


def _fact_state(project_id: str, frame_version: int, dependency: FactDependency) -> dict[str, Any]:
    rows = fetch_all(
        """SELECT publisher_element,fact_type,scope_ref,status,fact_version,updated_at
           FROM takeoff_fact_set WHERE project_id=%s AND fact_type=%s AND frame_version=%s
           ORDER BY updated_at DESC""",
        (project_id, dependency.fact_type, frame_version),
    )
    if rows:
        statuses = {row["status"] for row in rows}
        if statuses and statuses.issubset({"complete", "complete_empty"}):
            status = "complete_empty" if statuses == {"complete_empty"} else "complete"
        elif "pending" in statuses:
            status = "pending"
        else:
            status = "absent"
        return {
            "fact_type": dependency.fact_type,
            "publisher_element": dependency.publisher_element,
            "required": dependency.required,
            "status": status,
            "scopes": rows,
        }
    return {
        "fact_type": dependency.fact_type,
        "publisher_element": dependency.publisher_element,
        "required": dependency.required,
        "status": "pending" if dependency.required else "absent",
        "scopes": [],
    }


def _floor_geometry_status(project_id: str, level_id: str) -> dict[str, Any]:
    row = fetch_one(
        """SELECT tf.id AS floor_id,
                  count(fs.id) FILTER (WHERE fs.excluded=false) AS total,
                  count(fs.id) FILTER (WHERE fs.excluded=false AND fs.user_confirmed=false) AS unconfirmed
           FROM takeoff_floor tf LEFT JOIN floor_space fs ON fs.floor_id=tf.id
           WHERE tf.project_id=%s AND tf.storey_id=%s GROUP BY tf.id""",
        (project_id, level_id),
    )
    if not row or int(row.get("total") or 0) == 0:
        return {"status": "absent", "floor_id": str(row["floor_id"]) if row else None}
    if int(row.get("unconfirmed") or 0) > 0:
        return {"status": "pending", "floor_id": str(row["floor_id"]), "unconfirmed": int(row["unconfirmed"])}
    return {"status": "complete", "floor_id": str(row["floor_id"]), "total": int(row["total"])}


def _question(scope_ref: str, code: str, kind: str, prompt: str, *, effect: str = "hold", options: list[dict[str, str]] | None = None, entity_refs: list[str] | None = None) -> dict[str, Any]:
    return {
        "scope_ref": scope_ref or "project",
        "code": code,
        "kind": kind,
        "prompt": prompt,
        "effect": effect,
        "options": options or [],
        "entity_refs": entity_refs or [],
    }


def _select_primary_for_group(project_id: str, frame_version: int, spec: ElementScopeSpec, scope_ref: str,
                              candidates: list[tuple[dict[str, Any], dict[str, Any] | None]], sheets: dict[str, dict[str, Any]],
                              questions: list[dict[str, Any]], gaps: list[dict[str, Any]]) -> list[tuple[dict[str, Any], dict[str, Any] | None]]:
    if not candidates:
        return []
    if not spec.one_primary_per_group or len(candidates) == 1:
        return candidates
    code = "choose_primary_source"
    answer = answered_choice(project_id, spec.key, frame_version, scope_ref, code)
    ids = {str(vp["id"]) for vp, _ in candidates}
    if answer in ids:
        return [(vp, level) for vp, level in candidates if str(vp["id"]) == answer]
    options = [
        {"value": str(vp["id"]), "label": vp.get("name") or sheets.get(str(vp.get("sheet_id")), {}).get("title") or str(vp["id"])}
        for vp, _ in candidates
    ]
    questions.append(_question(
        scope_ref,
        code,
        "single_choice",
        f"More than one {spec.label} drawing can represent this scope. Choose the primary measurement source.",
        effect="halt_scope",
        options=options,
        entity_refs=list(ids),
    ))
    gaps.append({
        "code": "ambiguous_primary_source",
        "scope_ref": scope_ref,
        "severity": "blocked",
        "message": f"{len(candidates)} plausible primary {spec.label} sources require a surveyor choice.",
        "entity_refs": list(ids),
    })
    return []


def compute_scope(project_id: str, element: str) -> dict[str, Any]:
    spec = get_scope_spec(element)
    frame, frame_version = _load_frame(project_id)
    element = spec.key
    sheets = {str(row["id"]): row for row in frame.get("sheets") or []}
    levels = sorted(list(frame.get("levels") or []), key=lambda item: int(item.get("level_index") or 0))
    frame_viewports = {str(vp["id"]): vp for vp in frame.get("viewports") or []}
    candidates, used_legacy = _primary_candidates(frame, spec)
    gaps: list[dict[str, Any]] = []
    holds: list[dict[str, Any]] = []
    questions: list[dict[str, Any]] = []
    selected: list[dict[str, Any]] = []
    level_scopes: list[dict[str, Any]] = []

    if used_legacy:
        gaps.append({
            "code": "legacy_pre_classification",
            "scope_ref": "project",
            "severity": "warning",
            "message": f"{spec.label} source selection used a legacy viewport-name fallback. New Pre triage should assign the explicit subject.",
            "entity_refs": [str(vp["id"]) for vp in candidates],
        })

    # Floor has the strongest trusted mapping already: storey.source_viewport_id from Pre.
    if spec.use_storey_source:
        used_ids: set[str] = set()
        for level in levels:
            scope_ref = str(level["id"])
            direct_id = str(level.get("source_viewport_id") or "")
            group_candidates: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
            if direct_id and direct_id in frame_viewports and frame_viewports[direct_id].get("view_kind") == "plan":
                direct = {**frame_viewports[direct_id], "selection_basis": "pre_storey_source"}
                group_candidates = [(direct, level)]
            else:
                group_candidates = [(vp, _match_level(vp, levels)) for vp in candidates if _match_level(vp, levels) and str(_match_level(vp, levels)["id"]) == scope_ref]
            chosen = _select_primary_for_group(project_id, frame_version, spec, scope_ref, group_candidates, sheets, questions, gaps)
            primaries = []
            for vp, matched_level in chosen:
                output = _viewport_output(vp, spec.primary_role, matched_level, scope_ref, sheets)
                selected.append(output); used_ids.add(str(vp["id"])); primaries.append(str(vp["id"]))
                if output["scale"]["status"] != "confirmed":
                    gaps.append({"code": "scale_not_confirmed", "scope_ref": scope_ref, "severity": "blocked", "message": f"{vp.get('name') or spec.label} has no confirmed scale in Pre.", "entity_refs": [str(vp["id"])]})
                    questions.append(_question(scope_ref, "scale_not_confirmed", "guidance", "This measurement drawing has no confirmed scale. Confirm it in Pre, or exclude the drawing.", effect="halt_viewport", entity_refs=[str(vp["id"])]))
            if not primaries:
                gaps.append({"code": "primary_not_found", "scope_ref": scope_ref, "severity": "blocked", "message": f"No approved {spec.label} primary plan was found for {level.get('name')}.", "entity_refs": []})
                questions.append(_question(scope_ref, "primary_not_found", "guidance", f"No {spec.label} plan was found for {level.get('name')}. Review the Plans stage in Pre.", effect="halt_scope"))
            level_scopes.append({"scope_ref": scope_ref, "level_ref": scope_ref, "label": level.get("name"), "primary_viewport_ids": primaries, "geometry_route": "drawing" if primaries else "not_found"})
    elif spec.group_mode == "level":
        grouped: dict[str, list[tuple[dict[str, Any], dict[str, Any] | None]]] = {str(level["id"]): [] for level in levels}
        unmapped: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
        for vp in candidates:
            matches = _column_span_levels(vp, levels) if spec.key == "columns" else _matching_levels(vp, levels)
            if matches:
                for level in matches:
                    grouped[str(level["id"])].append((vp, level))
            else:
                unmapped.append((vp, None))
        for level in levels:
            scope_ref = str(level["id"])
            group_candidates = grouped.get(scope_ref) or []
            # Some elements (for example stairs/ramps) only exist on selected levels.
            # Do not manufacture a missing-plan error for levels where Pre has no candidate.
            if not group_candidates and not spec.require_every_level:
                continue
            chosen = _select_primary_for_group(project_id, frame_version, spec, scope_ref, group_candidates, sheets, questions, gaps)
            primaries = []
            for vp, matched_level in chosen:
                output = _viewport_output(vp, spec.primary_role, matched_level, scope_ref, sheets)
                selected.append(output); primaries.append(str(vp["id"]))
                if output["scale"]["status"] != "confirmed":
                    gaps.append({"code": "scale_not_confirmed", "scope_ref": scope_ref, "severity": "blocked", "message": f"{vp.get('name') or spec.label} has no confirmed scale in Pre.", "entity_refs": [str(vp["id"])]})
                    questions.append(_question(scope_ref, "scale_not_confirmed", "guidance", "This measurement drawing has no confirmed scale. Confirm it in Pre, or exclude the drawing.", effect="halt_viewport", entity_refs=[str(vp["id"])]))
            geometry_route = "drawing" if primaries else "not_found"
            if not primaries and spec.floor_geometry_fallback:
                floor_fact = _floor_geometry_status(project_id, scope_ref)
                if floor_fact["status"] == "complete":
                    geometry_route = "floor_geometry_fallback"
                elif floor_fact["status"] == "pending":
                    # Detection and commercial approval are separate gates. Show
                    # Floor-derived Ceiling candidates during review, but keep
                    # them unconfirmed and therefore outside the official BOQ.
                    geometry_route = "floor_geometry_fallback"
                    gaps.append({
                        "code": "floor_geometry_needs_review",
                        "scope_ref": scope_ref,
                        "severity": "warning",
                        "message": f"No ceiling drawing is available for {level.get('name')}; detected Floor geometry will be used as review-only Ceiling candidates.",
                        "entity_refs": [floor_fact["floor_id"]] if floor_fact.get("floor_id") else [],
                    })
                    questions.append(_question(
                        scope_ref,
                        "floor_geometry_needs_review",
                        "dependency",
                        "Review and confirm the Floor geometry before confirming any Floor-derived Ceiling quantities.",
                        effect="hold",
                        entity_refs=[floor_fact["floor_id"]] if floor_fact.get("floor_id") else [],
                    ))
                else:
                    gaps.append({"code": "floor_geometry_not_ready", "scope_ref": scope_ref, "severity": "blocked", "message": f"No ceiling drawing is available for {level.get('name')} and confirmed Floor geometry is not ready.", "entity_refs": []})
                    questions.append(_question(scope_ref, "floor_geometry_not_ready", "dependency", "No ceiling drawing is available. Confirm Floor geometry first so Ceiling can use the planned fallback.", effect="halt_scope"))
            elif not primaries:
                gaps.append({"code": "primary_not_found", "scope_ref": scope_ref, "severity": "blocked", "message": f"No approved {spec.label} primary plan was found for {level.get('name')}.", "entity_refs": []})
                questions.append(_question(scope_ref, "primary_not_found", "guidance", f"No {spec.label} plan was found for {level.get('name')}. Review the Plans stage in Pre or confirm a typical source later.", effect="halt_scope"))
            level_scopes.append({"scope_ref": scope_ref, "level_ref": scope_ref, "label": level.get("name"), "primary_viewport_ids": primaries, "geometry_route": geometry_route})
        if unmapped:
            gaps.append({"code": "unmapped_primary_candidates", "scope_ref": "project", "severity": "warning" if spec.allow_multiple_unmapped else "hold", "message": f"{len(unmapped)} {spec.label} plan candidate(s) are not mapped to a confirmed level.", "entity_refs": [str(vp["id"]) for vp, _ in unmapped]})
            if not spec.allow_multiple_unmapped:
                questions.append(_question("project", "unmapped_primary_candidates", "guidance", f"Some {spec.label} plan viewports are not mapped to a confirmed level in Pre.", effect="hold", entity_refs=[str(vp["id"]) for vp, _ in unmapped]))
    else:
        grouped: dict[str, list[tuple[dict[str, Any], dict[str, Any] | None]]] = {}
        for vp in candidates:
            level = _match_level(vp, levels)
            scope_ref = _group_ref(vp, spec, level, sheets)
            grouped.setdefault(scope_ref, []).append((vp, level))
        if not grouped:
            gaps.append({"code": "primary_not_found", "scope_ref": "project", "severity": "blocked", "message": f"No approved {spec.label} primary geometry source was found.", "entity_refs": []})
            questions.append(_question("project", "primary_not_found", "guidance", f"No {spec.label} source was found in the frozen Pre frame. Review Plans in Pre.", effect="halt_scope"))
        for scope_ref, group_candidates in grouped.items():
            chosen = _select_primary_for_group(project_id, frame_version, spec, scope_ref, group_candidates, sheets, questions, gaps)
            primaries = []
            level_ref = None
            label = scope_ref
            for vp, level in chosen:
                output = _viewport_output(vp, spec.primary_role, level, scope_ref, sheets)
                selected.append(output); primaries.append(str(vp["id"])); level_ref = str(level["id"]) if level else level_ref
                label = vp.get("name") or label
                if output["scale"]["status"] != "confirmed":
                    gaps.append({"code": "scale_not_confirmed", "scope_ref": scope_ref, "severity": "blocked", "message": f"{vp.get('name') or spec.label} has no confirmed scale in Pre.", "entity_refs": [str(vp["id"])]})
                    questions.append(_question(scope_ref, "scale_not_confirmed", "guidance", "This measurement drawing has no confirmed scale. Confirm it in Pre, or exclude the drawing.", effect="halt_viewport", entity_refs=[str(vp["id"])]))
            level_scopes.append({"scope_ref": scope_ref, "level_ref": level_ref, "label": label, "primary_viewport_ids": primaries, "geometry_route": "drawing" if primaries else "not_found"})

    primary_ids = {row["viewport_id"] for row in selected}
    supporting = _supporting_viewports(frame, spec, primary_ids)
    selected.extend(supporting)

    transform_by_viewport = {str(row.get("viewport_id")): row for row in (frame.get("transforms") or [])}
    for row in selected:
        transform = transform_by_viewport.get(str(row["viewport_id"]))
        row["source_transform"] = {
            "page_id": str(transform.get("page_id")) if transform and transform.get("page_id") else None,
            "render_id": str(transform.get("render_id")) if transform and transform.get("render_id") else None,
            "width_px": transform.get("width_px") if transform else None,
            "height_px": transform.get("height_px") if transform else None,
            "page_from_image": transform.get("page_from_image") if transform else None,
            "status": "confirmed" if transform else "missing",
        }
        if row["role"] == spec.primary_role and not transform:
            gaps.append({
                "code": "source_transform_missing",
                "scope_ref": row.get("scope_ref") or "project",
                "severity": "blocked",
                "message": f"The approved {spec.label} measurement viewport has no frozen source transform/render in Pre.",
                "entity_refs": [str(row["viewport_id"])],
            })
            questions.append(_question(row.get("scope_ref") or "project", "source_transform_missing", "guidance", "This measurement viewport has no usable frozen render/transform. Review the drawing in Pre.", effect="halt_viewport", entity_refs=[str(row["viewport_id"])]))
        if row["role"] == "supporting_attribute" and row.get("view_kind") == "plan":
            row["spatial_alignment"] = "level_mapped_only" if row.get("level_ref") else "not_established"

    supporting_specs = _supporting_specs(frame, spec)

    vertical = [row for row in supporting if row["role"] == "supporting_vertical"]
    if spec.require_vertical_evidence:
        mapped_vertical: dict[str, list[str]] = {}
        general_vertical: list[str] = []
        for row in vertical:
            level_ref = row.get("level_ref")
            if level_ref:
                mapped_vertical.setdefault(str(level_ref), []).append(str(row["viewport_id"]))
            else:
                general_vertical.append(str(row["viewport_id"]))

        # Record coverage at the smallest scope we can prove. An unlocated section is still
        # useful supporting evidence, but it is marked as general rather than pretending it
        # is mapped to a particular storey.
        if level_scopes:
            for level_scope in level_scopes:
                scope_ref = str(level_scope.get("scope_ref") or "project")
                level_ref = str(level_scope.get("level_ref") or "")
                direct = mapped_vertical.get(level_ref, []) if level_ref else []
                if direct:
                    level_scope["vertical_coverage"] = {"status": "mapped", "viewport_ids": direct}
                elif general_vertical:
                    level_scope["vertical_coverage"] = {"status": "general", "viewport_ids": general_vertical}
                else:
                    level_scope["vertical_coverage"] = {"status": "missing", "viewport_ids": []}
                    gaps.append({"code": "vertical_evidence_not_found", "scope_ref": scope_ref, "severity": "hold", "message": f"No supporting section/elevation evidence is registered for {level_scope.get('label') or spec.label}.", "entity_refs": []})
                    questions.append(_question(scope_ref, "vertical_evidence_not_found", "anomaly", f"No section/elevation evidence is currently available for {level_scope.get('label') or spec.label}. Vertical facts will remain on hold.", effect="hold_vertical"))
        elif not vertical:
            gaps.append({"code": "vertical_evidence_not_found", "scope_ref": "project", "severity": "hold", "message": f"No supporting section/elevation evidence is registered for {spec.label}.", "entity_refs": []})
            questions.append(_question("project", "vertical_evidence_not_found", "anomaly", f"No section/elevation evidence is currently available for {spec.label}. Vertical facts will remain on hold.", effect="hold_vertical"))

    if spec.require_storey_height:
        for level in levels:
            if level.get("height_mm") is None:
                scope_ref = str(level["id"])
                gaps.append({"code": "storey_height_missing", "scope_ref": scope_ref, "severity": "blocked", "message": f"Storey height is missing for {level.get('name')}.", "entity_refs": []})
                questions.append(_question(scope_ref, "storey_height_missing", "guidance", "Storey height is missing. Resolve it in Pre Height before this scope can finish.", effect="halt_scope"))

    if spec.require_level_datum:
        has_datum = any(str(item.get("kind") or "") == "level_datum" or "datum" in _norm(item.get("topic") or item.get("name")) for item in frame.get("spec_items") or [])
        has_datum = has_datum or bool(answered_choice(project_id, spec.key, frame_version, "project", "level_datum_unknown"))
        if not has_datum:
            gaps.append({"code": "level_datum_unknown", "scope_ref": "project", "severity": "hold", "message": "The meaning of printed beam elevation/datum values is not confirmed.", "entity_refs": []})
            questions.append(_question("project", "level_datum_unknown", "single_choice", "What does the printed beam elevation represent?", effect="hold_datum", options=[
                {"value": "structural_slab_top", "label": "Structural slab top"},
                {"value": "finished_floor", "label": "Finished floor level"},
                {"value": "other", "label": "Another datum"},
            ]))

    consumed_facts = [_fact_state(project_id, frame_version, dependency) for dependency in spec.dependencies]

    def fact_status_for_scope(fact: dict[str, Any], scope_ref: str) -> str:
        rows = list(fact.get("scopes") or [])
        exact = [row for row in rows if str(row.get("scope_ref") or "project") == scope_ref]
        project_rows = [row for row in rows if str(row.get("scope_ref") or "project") == "project"]
        relevant = exact or project_rows
        if not relevant:
            return "pending" if fact.get("required") else "absent"
        statuses = {str(row.get("status")) for row in relevant}
        if statuses and statuses.issubset({"complete", "complete_empty"}):
            return "complete_empty" if statuses == {"complete_empty"} else "complete"
        if "pending" in statuses:
            return "pending"
        return "absent"

    if consumed_facts and level_scopes:
        for level_scope in level_scopes:
            scope_ref = str(level_scope.get("scope_ref") or "project")
            scoped_states = []
            for fact in consumed_facts:
                state = fact_status_for_scope(fact, scope_ref)
                scoped_states.append({
                    "fact_type": fact["fact_type"],
                    "publisher_element": fact["publisher_element"],
                    "required": fact["required"],
                    "status": state,
                })
                if fact["required"] and state not in {"complete", "complete_empty"}:
                    holds.append({
                        "code": "dependency_not_ready",
                        "scope_ref": scope_ref,
                        "fact_type": fact["fact_type"],
                        "publisher_element": fact["publisher_element"],
                        "status": state,
                        "message": f"{fact['fact_type']} from {fact['publisher_element']} is not ready for this scope. Affected downstream facts must wait.",
                    })
            level_scope["consumed_facts"] = scoped_states
    else:
        for fact in consumed_facts:
            if fact["required"] and fact["status"] not in {"complete", "complete_empty"}:
                holds.append({
                    "code": "dependency_not_ready",
                    "scope_ref": "project",
                    "fact_type": fact["fact_type"],
                    "publisher_element": fact["publisher_element"],
                    "status": fact["status"],
                    "message": f"{fact['fact_type']} from {fact['publisher_element']} is not ready. Affected downstream facts must wait.",
                })

    # Ceiling consumes Floor geometry only on levels where no RCP exists. A
    # pending source produces review candidates; only confirmed Ceiling output
    # can pass the later BOQ gate.
    if spec.floor_geometry_fallback:
        for level_scope in level_scopes:
            if level_scope["geometry_route"] == "floor_geometry_fallback":
                state = _floor_geometry_status(project_id, str(level_scope["level_ref"]))
                consumed_facts.append({"fact_type": "floor_geometry", "publisher_element": "floor", "required": True, "scope_ref": level_scope["scope_ref"], **state})

    has_block = any(gap["severity"] == "blocked" for gap in gaps)
    has_hold = bool(holds) or any(gap["severity"] == "hold" for gap in gaps)
    status = "blocked" if has_block else "partial" if has_hold else "ready"
    manifest = {
        "schema_version": SCOPE_SCHEMA_VERSION,
        "project_id": project_id,
        "element": element,
        "label": spec.label,
        "frame_version": frame_version,
        "generated_at": datetime.now(UTC).isoformat(),
        "status": status,
        "selected_viewports": selected,
        "level_scopes": level_scopes,
        "supporting_spec_items": supporting_specs,
        "consumed_facts": consumed_facts,
        "coverage_gaps": gaps,
        "holds": holds,
        "summary": {
            "primary_count": len({row["viewport_id"] for row in selected if row["role"] == spec.primary_role}),
            "supporting_count": len({row["viewport_id"] for row in selected if row["role"] != spec.primary_role}),
            "level_scope_count": len(level_scopes),
            "gap_count": len(gaps),
            "hold_count": len(holds),
        },
    }
    return {"manifest": manifest, "questions": questions}


def run_scope(project_id: str, element: str, *, force: bool = False) -> dict[str, Any]:
    element = canonical_element(element)
    frame, frame_version = _load_frame(project_id)
    del frame
    if not force:
        existing = fetch_one(
            """SELECT * FROM takeoff_scope_manifest
               WHERE project_id=%s AND element=%s AND frame_version=%s AND is_stale=false
               ORDER BY run_revision DESC, created_at DESC LIMIT 1""",
            (project_id, element, frame_version),
        )
        if existing and (existing.get("manifest_json") or {}).get("schema_version") == SCOPE_SCHEMA_VERSION:
            manifest = existing["manifest_json"]
            return {**manifest, "manifest_id": str(existing["id"]), "run_revision": int(existing["run_revision"]), "stale": False, "questions": list_questions(project_id, element, frame_version)}

    computed = compute_scope(project_id, element)
    manifest = computed["manifest"]
    content_hash = _hash(manifest)
    with transaction() as conn:
        current = conn.execute(
            """SELECT id,frame_version,run_revision FROM takeoff_scope_manifest
               WHERE project_id=%s AND element=%s AND is_stale=false
               ORDER BY frame_version DESC,run_revision DESC,created_at DESC
               LIMIT 1 FOR UPDATE""",
            (project_id, element),
        ).fetchone()
        previous_for_frame = conn.execute(
            """SELECT COALESCE(max(run_revision),0) AS revision
               FROM takeoff_scope_manifest
               WHERE project_id=%s AND element=%s AND frame_version=%s""",
            (project_id, element, frame_version),
        ).fetchone()
        next_revision = int(previous_for_frame["revision"] or 0) + 1
        if current:
            conn.execute(
                """UPDATE takeoff_scope_manifest
                   SET is_stale=true,superseded_at=COALESCE(superseded_at,now()),updated_at=now()
                   WHERE id=%s""",
                (str(current["id"]),),
            )
        row = conn.execute(
            """INSERT INTO takeoff_scope_manifest(
                   project_id,element,frame_version,status,manifest_json,content_hash,run_revision,is_stale
               ) VALUES (%s,%s,%s,%s,%s,%s,%s,false)
               RETURNING *""",
            (project_id, element, frame_version, manifest["status"], Jsonb(manifest), content_hash, next_revision),
        ).fetchone()
    questions = sync_questions(project_id, element, frame_version, computed["questions"])
    return {**manifest, "manifest_id": str(row["id"]), "run_revision": int(row["run_revision"]), "stale": False, "questions": questions}


def get_scope(project_id: str, element: str, *, auto_run: bool = True) -> dict[str, Any]:
    element = canonical_element(element)
    _, frame_version = _load_frame(project_id)
    row = fetch_one(
        """SELECT * FROM takeoff_scope_manifest
           WHERE project_id=%s AND element=%s AND is_stale=false
           ORDER BY frame_version DESC, run_revision DESC, updated_at DESC LIMIT 1""",
        (project_id, element),
    )
    schema_is_current = bool(row and (row.get("manifest_json") or {}).get("schema_version") == SCOPE_SCHEMA_VERSION)
    if not row or int(row["frame_version"]) != frame_version or not schema_is_current:
        if auto_run:
            return run_scope(project_id, element, force=True)
        if row:
            manifest = row["manifest_json"]
            return {**manifest, "manifest_id": str(row["id"]), "run_revision": int(row["run_revision"]), "stale": True, "questions": []}
        raise ValueError("Scope has not been run")
    manifest = row["manifest_json"]
    return {**manifest, "manifest_id": str(row["id"]), "run_revision": int(row["run_revision"]), "stale": False, "questions": list_questions(project_id, element, frame_version)}


def primary_viewports(project_id: str, element: str) -> list[dict[str, Any]]:
    scope = get_scope(project_id, element, auto_run=True)
    spec = get_scope_spec(element)
    return [row for row in scope.get("selected_viewports") or [] if row.get("role") == spec.primary_role and row.get("scale", {}).get("status") == "confirmed"]


def scope_for_level(project_id: str, element: str, level_ref: str) -> dict[str, Any] | None:
    scope = get_scope(project_id, element, auto_run=True)
    return next((row for row in scope.get("level_scopes") or [] if str(row.get("level_ref")) == str(level_ref)), None)
