from decimal import Decimal

from app.modules.pre.levels import expand_storey_labels, is_storey_label
from app.modules.pre.scale import parse_length_mm


def test_floor_height_units_are_normalized_to_mm():
    assert parse_length_mm("11'-6\"") == Decimal("3505.2")
    assert parse_length_mm("11 ft 6 in") == Decimal("3505.2")
    assert parse_length_mm("3.3 m") == Decimal("3300.0")
    assert parse_length_mm("3 300 mm") == Decimal("3300")


def test_level_datums_and_ranges_are_not_storeys():
    assert is_storey_label("FIRST FLOOR")
    assert is_storey_label("ROOF TERRACE")
    assert not is_storey_label("+ 80'-6\"")
    assert not is_storey_label("1st FLOOR UPTO ROOF TERRACE")
    assert not is_storey_label("02ND, 3RD, 4TH, 5TH & 6TH")
    assert expand_storey_labels("02ND, 3RD, 4TH, 5TH & 6TH") == [
        "SECOND FLOOR", "THIRD FLOOR", "FOURTH FLOOR", "FIFTH FLOOR", "SIXTH FLOOR"
    ]
