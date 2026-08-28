from decimal import Decimal
from contextlib import contextmanager
from uuid import uuid4

from app.modules.pre.scale import is_scale_eligible, parse_length_mm, parse_normalized_ratio, parse_scale_note, parse_word_scale, requires_primary_scale, roundness_score
from app.api.v1.routes.scale import _requires_primary_scale
from app.api.v1.routes import scale as scale_route


def test_metric_and_imperial_lengths():
    assert parse_length_mm("4500") == Decimal("4500")
    assert parse_length_mm("22'-0\"") == Decimal("6705.6")
    assert parse_length_mm("1'-7½\"") == Decimal("495.3")


def test_ratio_variants():
    assert parse_normalized_ratio("1:100") == Decimal("100")
    assert parse_normalized_ratio("1 : 100") == Decimal("100")
    assert parse_normalized_ratio("1:1") == Decimal("1")
    assert parse_normalized_ratio("2:1") == Decimal("0.5")


def test_architectural_and_engineering_scale():
    architectural = parse_scale_note({"kind": "imperial_architectural", "text": '1/8" = 1\'-0"', "normalized_ratio": None})
    engineering = parse_scale_note({"kind": "imperial_engineering", "text": '1" = 10\'', "normalized_ratio": None})
    assert architectural["factor"] == Decimal("96")
    assert engineering["factor"] == Decimal("120")
    prefixed = parse_scale_note({"kind": "imperial_architectural", "text": 'Scale: 1/8" = 1\' 0"', "normalized_ratio": None})
    assert prefixed["factor"] == Decimal("96")


def test_plain_text_only_uses_normalized_ratio():
    parsed = parse_scale_note({"kind": "plain_text", "text": "one eighth inch equals one foot", "normalized_ratio": "1:96"})
    assert parsed["factor"] == Decimal("96")
    rejected = parse_scale_note({"kind": "ratio", "text": "1:100", "normalized_ratio": "1:100"})
    assert rejected["status"] == "unparseable"


def test_written_imperial_scale_variants():
    assert parse_word_scale("SCALE: EIGHT FEET TO AN INCH") == Decimal("96")
    assert parse_word_scale("one inch equals eight feet") == Decimal("96")
    assert parse_word_scale("half inch to one foot") == Decimal("24")
    parsed = parse_scale_note({"kind": "plain_text", "text": "TWO FEET TO AN INCH", "normalized_ratio": None})
    assert parsed["factor"] == Decimal("24")


def test_non_numeric_scale_kinds():
    for kind in ("graphic", "as_indicated", "not_to_scale"):
        assert parse_scale_note({"kind": kind, "text": kind, "normalized_ratio": None})["status"] == "non_numeric"


def test_primary_scale_workflow_eligibility():
    assert _requires_primary_scale({"view_kind": "plan", "name": "First Floor Plan"})
    assert _requires_primary_scale({"view_kind": "section", "name": "Section A-A"})
    assert _requires_primary_scale({"view_kind": "elevation", "name": "Front Elevation"})
    assert not _requires_primary_scale({"view_kind": "detail", "name": "Column Footing Detail"})
    assert not _requires_primary_scale({"view_kind": "plan", "name": "Site Plan"})
    assert not _requires_primary_scale({"view_kind": "notes", "name": "General Notes"})


def test_takeoff_scale_gate_only_requires_measurement_plans():
    assert requires_primary_scale({"view_kind": "plan", "discipline": "architectural", "name": "First Floor Plan"})
    assert requires_primary_scale({"view_kind": "plan", "discipline": "architectural", "name": "Roof Plan"})
    assert not requires_primary_scale({"view_kind": "section", "discipline": "architectural", "name": "Section A-A"})
    assert not requires_primary_scale({"view_kind": "elevation", "discipline": "architectural", "name": "Front Elevation"})
    assert requires_primary_scale({"view_kind": "plan", "discipline": "structural", "name": "General Arrangement of Columns & Walls"})
    assert requires_primary_scale({"view_kind": "plan", "discipline": "structural", "name": "S-101", "subjects": ["beam", "slab"]})
    assert not requires_primary_scale({"view_kind": "section", "discipline": "structural", "name": "Section A-A", "subjects": ["beam"]})
    assert not requires_primary_scale({"view_kind": "plan", "discipline": "civil_site", "name": "Site Plan"})
    assert is_scale_eligible({"view_kind": "section", "name": "Section A-A"})


def test_roundness_score_is_supplementary():
    assert roundness_score(Decimal("96"), [9.0, 18.0], "in") == Decimal("1")


def test_scale_propagation_requires_matching_target_printed_evidence(monkeypatch):
    source_id, matching_id, conflicting_id = uuid4(), uuid4(), uuid4()
    source_scale_id, propagated_scale_id = uuid4(), uuid4()
    source = {"id": source_id, "view_kind": "plan", "discipline": "architectural", "name": "First Floor Plan"}
    candidates = [
        {"id": matching_id, "view_kind": "plan", "discipline": "architectural", "name": "Typical Floor Plan", "crop_version": 1, "latest_status": "proposed", "latest_checks": {"printed": {"factor": 96}}},
        {"id": conflicting_id, "view_kind": "plan", "discipline": "architectural", "name": "Roof Plan", "crop_version": 1, "latest_status": "proposed", "latest_checks": {"printed": {"factor": 48}}},
    ]
    monkeypatch.setattr(scale_route, "fetch_one", lambda *_: {"project_id": uuid4()})
    monkeypatch.setattr(scale_route, "fetch_all", lambda *_: candidates)
    confirmed = []
    monkeypatch.setattr(scale_route, "confirm", lambda entity_type, entity_id, actor="user": confirmed.append((entity_type, entity_id, actor)))

    class Connection:
        def execute(self, *_):
            return self
        def fetchone(self):
            return {"id": propagated_scale_id}

    @contextmanager
    def fake_transaction():
        yield Connection()

    monkeypatch.setattr(scale_route, "transaction", fake_transaction)
    propagated = scale_route._propagate_matching_plan_scales(source, source_scale_id, Decimal("96"))
    assert propagated == [str(matching_id)]
    assert confirmed == [("scale", propagated_scale_id, "scale_propagation")]
