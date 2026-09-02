from __future__ import annotations

from typing import Any

from ....database.connection import fetch_all, fetch_one
from .contracts import EvaluationIssue, EvaluationReport


def _count(sql: str, params: tuple[Any, ...]) -> int:
    row = fetch_one(sql, params)
    return int(row.get("n") or 0) if row else 0


def _floor(project_id: str) -> EvaluationReport:
    floors = fetch_all("SELECT id,name FROM takeoff_floor WHERE project_id=%s ORDER BY level_index", (project_id,))
    issues: list[EvaluationIssue] = []
    spaces = _count("SELECT count(*) AS n FROM floor_space WHERE project_id=%s AND excluded=false", (project_id,))
    missing = []
    for floor in floors:
        n = _count("SELECT count(*) AS n FROM floor_space WHERE floor_id=%s AND excluded=false", (str(floor["id"]),))
        if n == 0:
            missing.append(str(floor.get("name") or floor["id"]))
    if missing:
        issues.append(EvaluationIssue("floor_scope_without_space", f"No FloorSpace was saved for: {', '.join(missing)}", "error"))
    boundary_review = _count(
        """SELECT count(*) AS n FROM floor_space
           WHERE project_id=%s AND excluded=false AND space_kind<>'connector'
             AND COALESCE(geometry_status,'boundary_review') NOT IN ('wall_verified','user_verified')""",
        (project_id,),
    )
    if boundary_review:
        issues.append(EvaluationIssue(
            "floor_boundary_unverified",
            f"{boundary_review} room boundary/boundaries are not sufficiently supported by PDF wall vectors. Correct them before confirmation or BOQ.",
            "error",
        ))
    unassigned = _count("SELECT count(*) AS n FROM finish_assignment WHERE project_id=%s AND (status='unassigned' OR review_required=true)", (project_id,))
    unresolved_work = _count("SELECT count(*) AS n FROM floor_work_assignment WHERE project_id=%s AND (status='unassigned' OR review_required=true)", (project_id,))
    if unassigned:
        issues.append(EvaluationIssue("floor_finish_unassigned", f"{unassigned} floor finish assignment(s) remain unassigned."))
    if unresolved_work:
        issues.append(EvaluationIssue("floor_work_unassigned", f"{unresolved_work} floor-work assignment(s) remain unassigned."))
    latest_runs = fetch_all(
        """SELECT DISTINCT ON (floor_id) floor_id,result_json
           FROM takeoff_analysis_run
           WHERE project_id=%s AND module='floor' AND status='completed' AND floor_id IS NOT NULL
           ORDER BY floor_id,created_at DESC""",
        (project_id,),
    )
    coverage_floors: list[str] = []
    floor_names = {str(floor["id"]): str(floor.get("name") or floor["id"]) for floor in floors}
    for run in latest_runs:
        result = run.get("result_json") or {}
        warnings = result.get("warnings") if isinstance(result, dict) else []
        if any(str(warning).startswith("Coverage review:") for warning in (warnings or [])):
            coverage_floors.append(floor_names.get(str(run.get("floor_id")), str(run.get("floor_id"))))
    if coverage_floors:
        issues.append(EvaluationIssue(
            "floor_room_label_coverage",
            f"Likely labelled rooms remain outside detected floor geometry on: {', '.join(coverage_floors)}. Review the highlighted drawing before confirmation.",
            "warning",
            tuple(str(run.get("floor_id")) for run in latest_runs if floor_names.get(str(run.get("floor_id"))) in coverage_floors),
        ))
    status = "fail" if any(x.severity == "error" for x in issues) else "pass_with_flags" if issues else "pass"
    return EvaluationReport("floor", status, tuple(issues), {"floors": len(floors), "spaces": spaces, "wall_boundary_review": boundary_review, "unassigned_finishes": unassigned, "room_label_coverage_floors": len(coverage_floors)})


def _ceiling(project_id: str) -> EvaluationReport:
    zones = _count("SELECT count(*) AS n FROM ceiling_zone WHERE project_id=%s", (project_id,))
    issues: list[EvaluationIssue] = []
    incomplete_surface = _count(
        "SELECT count(*) AS n FROM ceiling_zone WHERE project_id=%s AND include_in_boq=true AND profile_type NOT IN ('no_ceiling','open_to_sky') AND COALESCE(surface_area_m2,net_area_m2) IS NULL",
        (project_id,),
    )
    unassigned = _count("SELECT count(*) AS n FROM ceiling_zone WHERE project_id=%s AND include_in_boq=true AND definition_id IS NULL", (project_id,))
    if zones == 0:
        issues.append(EvaluationIssue("ceiling_no_zones", "No ceiling zones were saved. Confirm Floor geometry or an RCP source.", "error"))
    if incomplete_surface:
        issues.append(EvaluationIssue("ceiling_surface_unresolved", f"{incomplete_surface} ceiling zone(s) do not yet have a safe measurable surface area."))
    if unassigned:
        issues.append(EvaluationIssue("ceiling_definition_unassigned", f"{unassigned} measurable ceiling zone(s) have no resolved ceiling system/finish."))
    status = "fail" if any(x.severity == "error" for x in issues) else "pass_with_flags" if issues else "pass"
    return EvaluationReport("ceiling", status, tuple(issues), {"zones": zones, "surface_unresolved": incomplete_surface})


def _walls(project_id: str) -> EvaluationReport:
    walls = _count("SELECT count(*) AS n FROM wall_instance WHERE project_id=%s", (project_id,))
    review = _count("SELECT count(*) AS n FROM wall_review_item WHERE project_id=%s AND resolved=false", (project_id,))
    missing_dims = _count("SELECT count(*) AS n FROM wall_instance WHERE project_id=%s AND (length_m IS NULL OR thickness_mm IS NULL OR height_mm IS NULL)", (project_id,))
    issues: list[EvaluationIssue] = []
    if walls == 0:
        issues.append(EvaluationIssue("wall_none_detected", "No production walls were saved from the approved Wall scope.", "error"))
    if missing_dims:
        issues.append(EvaluationIssue("wall_dimension_unresolved", f"{missing_dims} wall(s) still have unresolved length, thickness or height."))
    if review:
        issues.append(EvaluationIssue("wall_review_open", f"{review} wall review item(s) remain unresolved."))
    status = "fail" if any(x.severity == "error" for x in issues) else "pass_with_flags" if issues else "pass"
    return EvaluationReport("walls", status, tuple(issues), {"walls": walls, "review_open": review, "dimension_unresolved": missing_dims})


def _openings(project_id: str, only_kind: str | None = None) -> EvaluationReport:
    doors = _count("SELECT count(*) AS n FROM opening_instance WHERE project_id=%s AND kind='door' AND status<>'deleted'", (project_id,))
    windows = _count("SELECT count(*) AS n FROM opening_instance WHERE project_id=%s AND kind='window' AND status<>'deleted'", (project_id,))
    if only_kind:
        review = _count(
            """SELECT count(*) AS n FROM opening_review_item ri
               LEFT JOIN opening_instance oi ON oi.id=ri.opening_id
               WHERE ri.project_id=%s AND ri.resolved=false AND (ri.opening_id IS NULL OR oi.kind=%s)""",
            (project_id, only_kind),
        )
    else:
        review = _count("SELECT count(*) AS n FROM opening_review_item WHERE project_id=%s AND resolved=false", (project_id,))
    kind_sql = " AND kind=%s" if only_kind else ""
    kind_params: tuple[Any, ...] = (project_id, only_kind) if only_kind else (project_id,)
    no_host = _count(f"SELECT count(*) AS n FROM opening_instance WHERE project_id=%s AND status<>'deleted' AND host_wall_id IS NULL{kind_sql}", kind_params)
    unresolved_size = _count(f"SELECT count(*) AS n FROM opening_instance WHERE project_id=%s AND status<>'deleted' AND (clear_width_mm IS NULL OR clear_height_mm IS NULL){kind_sql}", kind_params)
    issues: list[EvaluationIssue] = []
    selected_count = doors if only_kind == "door" else windows if only_kind == "window" else doors + windows
    if selected_count == 0:
        label = only_kind or "door or window"
        issues.append(EvaluationIssue("opening_none_detected", f"No {label} instances were saved from the approved opening plans."))
    if no_host:
        issues.append(EvaluationIssue("opening_host_unresolved", f"{no_host} opening(s) are not yet safely hosted on a production wall."))
    if unresolved_size:
        issues.append(EvaluationIssue("opening_size_unresolved", f"{unresolved_size} opening(s) do not yet have both supported width and height."))
    if review:
        issues.append(EvaluationIssue("opening_review_open", f"{review} opening review item(s) remain unresolved."))
    report_element = f"{only_kind}s" if only_kind else "doors-windows"
    return EvaluationReport(report_element, "pass_with_flags" if issues else "pass", tuple(issues), {
        "doors": doors, "windows": windows, "review_open": review,
    })


def _roof(project_id: str) -> EvaluationReport:
    levels = _count("SELECT count(*) AS n FROM roof_level WHERE project_id=%s", (project_id,))
    planes = _count("SELECT count(*) AS n FROM roof_plane WHERE project_id=%s", (project_id,))
    review = _count("SELECT count(*) AS n FROM roof_review_item WHERE project_id=%s AND resolved=false", (project_id,))
    unresolved = _count("SELECT count(*) AS n FROM roof_plane WHERE project_id=%s AND measurement_status<>'measured'", (project_id,))
    issues: list[EvaluationIssue] = []
    if levels and not planes:
        issues.append(EvaluationIssue("roof_no_planes", "Roof sources exist but no measurable roof plane was saved.", "error"))
    if unresolved:
        issues.append(EvaluationIssue("roof_measurement_unresolved", f"{unresolved} roof plane(s) still require pitch/profile evidence before safe surface measurement."))
    if review:
        issues.append(EvaluationIssue("roof_review_open", f"{review} roof review item(s) remain unresolved."))
    status = "fail" if any(x.severity == "error" for x in issues) else "pass_with_flags" if issues else "pass"
    return EvaluationReport("roof", status, tuple(issues), {"levels": levels, "planes": planes, "review_open": review})


def _stairs_ramps(project_id: str, only_kind: str | None = None) -> EvaluationReport:
    stairs = _count("SELECT count(*) AS n FROM stair_ramp_instance WHERE project_id=%s AND kind='stair' AND status<>'deleted'", (project_id,))
    ramps = _count("SELECT count(*) AS n FROM stair_ramp_instance WHERE project_id=%s AND kind='ramp' AND status<>'deleted'", (project_id,))
    if only_kind:
        review = _count(
            """SELECT count(*) AS n FROM stair_ramp_review_item ri
               LEFT JOIN stair_ramp_instance i ON i.id=ri.instance_id
               WHERE ri.project_id=%s AND ri.resolved=false AND (ri.instance_id IS NULL OR i.kind=%s)""",
            (project_id, only_kind),
        )
    else:
        review = _count("SELECT count(*) AS n FROM stair_ramp_review_item WHERE project_id=%s AND resolved=false", (project_id,))
    kind_sql = " AND kind=%s" if only_kind else ""
    kind_params: tuple[Any, ...] = (project_id, only_kind) if only_kind else (project_id,)
    quantity_review = _count(f"SELECT count(*) AS n FROM stair_ramp_instance WHERE project_id=%s AND status<>'deleted' AND quantity_status NOT IN ('ready','measured'){kind_sql}", kind_params)
    issues: list[EvaluationIssue] = []
    if quantity_review:
        issues.append(EvaluationIssue("stair_ramp_quantity_unresolved", f"{quantity_review} stair/ramp item(s) still lack enough evidence for all supported quantities."))
    if review:
        issues.append(EvaluationIssue("stair_ramp_review_open", f"{review} stair/ramp review item(s) remain unresolved."))
    report_element = f"{only_kind}s" if only_kind else "stairs-ramps"
    return EvaluationReport(report_element, "pass_with_flags" if issues else "pass", tuple(issues), {
        "stairs": stairs, "ramps": ramps, "review_open": review,
    })


def evaluate_element(project_id: str, element: str) -> EvaluationReport:
    if element == "floor":
        return _floor(project_id)
    if element == "ceiling":
        return _ceiling(project_id)
    if element == "walls":
        return _walls(project_id)
    if element == "doors-windows":
        return _openings(project_id)
    if element == "doors":
        return _openings(project_id, "door")
    if element == "windows":
        return _openings(project_id, "window")
    if element == "roof":
        return _roof(project_id)
    if element == "stairs-ramps":
        return _stairs_ramps(project_id)
    if element == "stairs":
        return _stairs_ramps(project_id, "stair")
    if element == "ramps":
        return _stairs_ramps(project_id, "ramp")
    return EvaluationReport(element, "pass", (), {})
