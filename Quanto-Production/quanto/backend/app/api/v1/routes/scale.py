from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from ....database.json_value import Jsonb

from ....modules.pre.confirmations import confirm
from ....modules.pre.access import ensure_project_mutable, project_for_viewport
from ....modules.pre.scale import is_scale_eligible as _requires_primary_scale, manual_calibration_factor, requires_primary_scale, suggest_scale
from ....database.connection import fetch_all, fetch_one, transaction
from ..schemas import ScaleConfirm

router = APIRouter(tags=["scale"])


def _propagate_matching_plan_scales(source_viewport: dict, source_scale_id: UUID | str, factor: Decimal) -> list[str]:
    """Confirm the same scale on compatible plans with matching printed evidence."""
    project = fetch_one(
        """SELECT d.project_id FROM viewport v JOIN sheet s ON s.id=v.sheet_id
           JOIN page p ON p.id=s.page_id JOIN document d ON d.id=p.document_id WHERE v.id=%s""",
        (str(source_viewport["id"]),),
    )
    if not project or not requires_primary_scale(source_viewport):
        return []
    candidates = fetch_all(
        """SELECT v.*,sf.id AS latest_scale_id,sf.checks AS latest_checks,sf.status AS latest_status,
                  sf.crop_version AS latest_crop_version
           FROM viewport v JOIN sheet s ON s.id=v.sheet_id JOIN page p ON p.id=s.page_id
           JOIN document d ON d.id=p.document_id
           LEFT JOIN LATERAL (
             SELECT id,checks,status,crop_version FROM scale_fit
             WHERE viewport_id=v.id ORDER BY created_at DESC LIMIT 1
           ) sf ON true
           WHERE d.project_id=%s AND s.included=true AND v.relevant=true AND v.id<>%s""",
        (str(project["project_id"]), str(source_viewport["id"])),
    )
    propagated: list[str] = []
    for target in candidates:
        if not requires_primary_scale(target) or target.get("latest_status") == "confirmed":
            continue
        checks = dict(target.get("latest_checks") or {})
        printed = (checks.get("printed") or {}).get("factor")
        if printed is None or Decimal(str(printed)) <= 0:
            continue
        printed_factor = Decimal(str(printed))
        if abs(printed_factor - factor) / factor > Decimal("0.01"):
            continue
        propagated_checks = {
            **checks,
            "confirmed_factor": float(factor),
            "confirmed_axis": "propagated_matching_printed",
            "propagation": {
                "source_viewport_id": str(source_viewport["id"]),
                "source_scale_fit_id": str(source_scale_id),
                "target_printed_factor": float(printed_factor),
                "tolerance": 0.01,
            },
        }
        with transaction() as conn:
            row = conn.execute(
                """INSERT INTO scale_fit(viewport_id,method,factor_x,factor_y,anisotropy_ratio,checks,status,crop_version)
                   VALUES (%s,'propagated_matching_printed',%s,%s,1,%s,'confirmed',%s) RETURNING id""",
                (str(target["id"]), factor, factor, Jsonb(propagated_checks), target["crop_version"]),
            ).fetchone()
        confirm("scale", row["id"], "scale_propagation")
        propagated.append(str(target["id"]))
    return propagated

@router.post("/viewports/{viewport_id}/scale/suggest")
def suggest(viewport_id: UUID):
    viewport = fetch_one("SELECT view_kind,name FROM viewport WHERE id=%s", (str(viewport_id),))
    if not viewport:
        raise HTTPException(404, "Viewport not found")
    if not _requires_primary_scale(viewport):
        raise HTTPException(409, "This viewport is not part of the primary scale workflow")
    pid = project_for_viewport(viewport_id)
    if pid:
        try: ensure_project_mutable(pid)
        except PermissionError as exc: raise HTTPException(409, str(exc)) from exc
    try:
        return suggest_scale(viewport_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.put("/viewports/{viewport_id}/scale")
def set_scale(viewport_id: UUID, body: ScaleConfirm):
    pid = project_for_viewport(viewport_id)
    if pid:
        try: ensure_project_mutable(pid)
        except PermissionError as exc: raise HTTPException(409, str(exc)) from exc
    viewport = fetch_one("SELECT * FROM viewport WHERE id=%s", (str(viewport_id),))
    if not viewport:
        raise HTTPException(404, "Viewport not found")
    if not _requires_primary_scale(viewport):
        raise HTTPException(409, "This viewport is not part of the primary scale workflow")

    if body.mode == "manual":
        if not body.p1 or not body.p2 or not body.real_distance:
            raise HTTPException(400, "Manual calibration requires p1, p2 and real_distance")
        try:
            factor = manual_calibration_factor(viewport_id, body.p1, body.p2, body.real_distance, body.unit)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        checks = {
            "recommendation": "HUMAN_CALIBRATED",
            "confirmed_factor": float(factor),
            "confirmed_axis": "manual",
            "calibration": {"p1": body.p1, "p2": body.p2, "real_distance": body.real_distance, "unit": body.unit},
        }
        with transaction() as conn:
            row = conn.execute(
                """INSERT INTO scale_fit(viewport_id,method,factor_x,factor_y,anisotropy_ratio,checks,status,crop_version)
                   VALUES (%s,'human_calibrated',%s,%s,1,%s,'confirmed',%s) RETURNING *""",
                (str(viewport_id), factor, factor, Jsonb(checks), viewport["crop_version"]),
            ).fetchone()
        confirmation = confirm("scale", row["id"])
        propagated = _propagate_matching_plan_scales(viewport, row["id"], factor)
        return {"scale_fit": dict(row), "confirmation": confirmation, "propagated_viewport_ids": propagated}

    if not body.scale_fit_id:
        raise HTTPException(400, "scale_fit_id is required for suggested confirmation")
    fit = fetch_one("SELECT * FROM scale_fit WHERE id=%s AND viewport_id=%s", (str(body.scale_fit_id), str(viewport_id)))
    if not fit:
        raise HTTPException(404, "Scale suggestion not found")
    if fit["crop_version"] != viewport["crop_version"]:
        raise HTTPException(409, "Scale suggestion is stale because the viewport changed")
    checks = dict(fit.get("checks") or {})
    if checks.get("anisotropy_refused") and body.axis != "printed":
        raise HTTPException(409, "X/Y scale evidence is anisotropic; calibrate or choose validated evidence explicitly")

    factor = Decimal(str(body.chosen_factor)) if body.chosen_factor is not None else None
    axis = body.axis
    if factor is None and axis:
        if axis == "x" and fit.get("factor_x") is not None:
            factor = Decimal(str(fit["factor_x"]))
        elif axis == "y" and fit.get("factor_y") is not None:
            factor = Decimal(str(fit["factor_y"]))
        elif axis == "printed" and (checks.get("printed") or {}).get("factor") is not None:
            factor = Decimal(str(checks["printed"]["factor"]))
    if factor is None or factor <= 0:
        raise HTTPException(400, "Choose a valid scale factor/evidence before confirming")

    checks["confirmed_factor"] = float(factor)
    checks["confirmed_axis"] = axis or "chosen"
    with transaction() as conn:
        row = conn.execute(
            "UPDATE scale_fit SET checks=%s,status='confirmed' WHERE id=%s RETURNING *",
            (Jsonb(checks), str(body.scale_fit_id)),
        ).fetchone()
    confirmation = confirm("scale", row["id"])
    propagated = _propagate_matching_plan_scales(viewport, row["id"], factor)
    return {"scale_fit": dict(row), "confirmation": confirmation, "propagated_viewport_ids": propagated}
