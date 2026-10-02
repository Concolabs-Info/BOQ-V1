import pytest
from pydantic import ValidationError

from uuid import uuid4

from app.api.v1.routes.norms import DEFAULT_NORM_OPTIONS, NormChildInput, NormItemCreate, NormOptionCreate, RateBreakdownItemCreate, RateBreakdownRowInput, _build_breakdown_rows


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


def test_rate_breakdown_item_trims_analysis_fields():
    item = RateBreakdownItemCreate(
        norm_group_id=uuid4(),
        rate_file_id=uuid4(),
        main_item_name=" Concrete ",
        rows=[{"item_type": "material", "description": " Cement ", "quantity": 18, "unit": " cwt "}],
    )

    assert item.main_item_name == "Concrete"
    assert item.analysis_quantity == 1
    assert item.analysis_unit == "cube"
    assert item.rows[0].description == "Cement"
    assert item.rows[0].unit == "cwt"


def test_rate_breakdown_item_requires_child_row():
    with pytest.raises(ValidationError):
        RateBreakdownItemCreate(norm_group_id=uuid4(), rate_file_id=uuid4(), main_item_name="Concrete", rows=[])


def test_rate_breakdown_percentage_row_clears_rate_item():
    row = RateBreakdownRowInput(item_type="percentage", description="Allowance", quantity=2.5, rate_item_id=uuid4(), selected_rate=2500, selected_rate_label="Manual")

    assert row.rate_item_id is None
    assert row.selected_rate is None
    assert row.selected_rate_label is None
    assert row.unit is None


def test_rate_breakdown_manual_rate_row_trims_and_defaults_label():
    row = RateBreakdownRowInput(item_type="material", description="Cement", quantity=18, unit="bag", selected_rate=2500, selected_rate_label="  ")
    built = _build_breakdown_rows(uuid4(), uuid4(), [row])

    assert built[0]["rate_item_id"] is None
    assert built[0]["selected_rate"] == 2500
    assert built[0]["selected_rate_label"] == "Manual rate"
    assert built[0]["amount"] == 45000


def test_rate_breakdown_manual_rate_rejects_negative_rate():
    with pytest.raises(ValidationError):
        RateBreakdownRowInput(item_type="material", description="Cement", quantity=18, unit="bag", selected_rate=-1)
