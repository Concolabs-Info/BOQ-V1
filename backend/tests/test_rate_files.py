import pytest
from pydantic import ValidationError

from app.api.v1.routes.rate_files import RateItemCreate, RateOptionCreate


def test_rate_item_accepts_common_unit():
    item = RateItemCreate(
        material_name="Floor tile",
        specification="Matt finish",
        size="600 x 600 mm",
        unit_cost=1200,
        markup_percent=10,
        unit_type="m2",
        custom_unit="ignored",
    )

    assert item.material_name == "Floor tile"
    assert item.specification == "Matt finish"
    assert item.size == "600 x 600 mm"
    assert item.custom_unit is None


def test_rate_item_allows_empty_specification_and_size():
    item = RateItemCreate(
        material_name="Reinforcement steel",
        specification=" ",
        size=" ",
        unit_cost=450,
        markup_percent=5,
        unit_type="kg",
    )

    assert item.specification is None
    assert item.size is None


def test_rate_item_requires_material_name():
    with pytest.raises(ValidationError):
        RateItemCreate(
            material_name="",
            unit_cost=12,
            markup_percent=0,
            unit_type="m3",
        )


def test_rate_item_accepts_project_custom_unit_type():
    item = RateItemCreate(
        material_name="Special material",
        unit_cost=12,
        markup_percent=0,
        unit_type="box",
    )

    assert item.unit_type == "box"
    assert item.custom_unit is None


def test_rate_item_rejects_negative_unit_cost():
    with pytest.raises(ValidationError):
        RateItemCreate(
            material_name="Concrete",
            unit_cost=-1,
            markup_percent=0,
            unit_type="m3",
        )


def test_rate_item_requires_unit_type():
    with pytest.raises(ValidationError):
        RateItemCreate(
            material_name="Concrete",
            unit_cost=1,
            markup_percent=0,
            unit_type="",
        )


def test_rate_option_trims_value():
    option = RateOptionCreate(option_type="specification", value=" Grade C30/37 ")

    assert option.value == "Grade C30/37"
