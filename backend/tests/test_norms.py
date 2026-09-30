import pytest
from pydantic import ValidationError

from app.api.v1.routes.norms import DEFAULT_NORM_OPTIONS, NormChildInput, NormItemCreate, NormOptionCreate, RateBreakdownItemCreate


def test_norm_composition_trims_and_validates_fields():
    item = NormItemCreate(
        main_item_name=" Concrete ",
        items=[{"item_type": "material", "name": " Cement ", "quantity": 2.5, "unit": " bag "}],
    )

    assert item.main_item_name == "Concrete"
    assert item.items[0].name == "Cement"
    assert item.items[0].quantity == 2.5
    assert item.items[0].unit == "bag"


def test_norm_composition_requires_main_item_name():
    with pytest.raises(ValidationError):
        NormItemCreate(
            main_item_name=" ",
            items=[{"item_type": "material", "name": "Cement", "quantity": 2.5, "unit": "bag"}],
        )


def test_norm_composition_requires_child_row():
    with pytest.raises(ValidationError):
        NormItemCreate(main_item_name="Concrete", items=[])


def test_norm_item_rejects_negative_quantity():
    with pytest.raises(ValidationError):
        NormChildInput(item_type="labor", name="Mason", quantity=-1, unit="hour")


def test_norm_item_rejects_missing_unit():
    with pytest.raises(ValidationError):
        NormChildInput(item_type="machinery", name="Mixer", quantity=1, unit=" ")


def test_percentage_norm_item_allows_no_unit():
    item = NormChildInput(item_type="percentage", name="Overhead", quantity=12.5)

    assert item.name == "Overhead"
    assert item.quantity == 12.5
    assert item.unit is None


def test_norm_options_are_type_specific():
    material = NormOptionCreate(option_type="norm_material_unit", value=" cube ")
    labor = NormOptionCreate(option_type="norm_labor_unit", value=" crew-day ")
    machinery = NormOptionCreate(option_type="norm_machinery_unit", value=" machine-hour ")

    assert material.value == "cube"
    assert labor.value == "crew-day"
    assert machinery.value == "machine-hour"
    assert {"norm_material_unit", "norm_labor_unit", "norm_machinery_unit"}.issubset(DEFAULT_NORM_OPTIONS)


def test_rate_breakdown_item_trims_optional_fields():
    item = RateBreakdownItemCreate(code=" RB-01 ", title=" Structure ", description=" Concrete works ")

    assert item.code == "RB-01"
    assert item.title == "Structure"
    assert item.description == "Concrete works"
