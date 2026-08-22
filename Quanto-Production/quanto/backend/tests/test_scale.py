from decimal import Decimal

from app.modules.pre.scale import parse_length_mm, parse_normalized_ratio, parse_scale_note, roundness_score


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


def test_plain_text_only_uses_normalized_ratio():
    parsed = parse_scale_note({"kind": "plain_text", "text": "one eighth inch equals one foot", "normalized_ratio": "1:96"})
    assert parsed["factor"] == Decimal("96")
    rejected = parse_scale_note({"kind": "ratio", "text": "1:100", "normalized_ratio": "1:100"})
    assert rejected["status"] == "unparseable"


def test_non_numeric_scale_kinds():
    for kind in ("graphic", "as_indicated", "not_to_scale"):
        assert parse_scale_note({"kind": kind, "text": kind, "normalized_ratio": None})["status"] == "non_numeric"


def test_roundness_score_is_supplementary():
    assert roundness_score(Decimal("96"), [9.0, 18.0], "in") == Decimal("1")
