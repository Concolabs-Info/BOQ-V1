from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from ....database.json_value import Jsonb

from ....modules.pre.confirmations import confirm
from ....modules.pre.access import ensure_project_mutable, project_for_viewport
from ....modules.pre.scale import manual_calibration_factor, suggest_scale
from ....database.connection import fetch_one, transaction
from ..schemas import ScaleConfirm

router = APIRouter(tags=["scale"])


@router.post("/viewports/{viewport_id}/scale/suggest")
def suggest(viewport_id: UUID):
    viewport = fetch_one("SELECT view_kind FROM viewport WHERE id=%s", (str(viewport_id),))
    if not viewport:
        raise HTTPException(404, "Viewport not found")
    if viewport["view_kind"] == "notes":
        raise HTTPException(409, "Notes are specification evidence and do not require scale")
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
    if viewport["view_kind"] == "notes":
        raise HTTPException(409, "Notes are specification evidence and do not require scale")

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
        return {"scale_fit": dict(row), "confirmation": confirmation}

    if not body.scale_fit_id:
        raise HTTPException(400, "scale_fit_id is required for suggested confirmation")
    fit = fetch_one("SELECT * FROM scale_fit WHERE id=%s AND viewport_id=%s", (str(body.scale_fit_id), str(viewport_id)))
    if not fit:
        raise HTTPException(404, "Scale suggestion not found")
    if fit["crop_version"] != viewport["crop_version"]:
        raise HTTPException(409, "Scale suggestion is stale because the viewport changed")
    checks = dict(fit.get("checks") or {})
    if checks.get("anisotropy_refused"):
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
    return {"scale_fit": dict(row), "confirmation": confirmation}
