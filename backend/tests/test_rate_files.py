import pytest
from pydantic import ValidationError

from app.api.v1.routes.rate_files import MaterialAttributeCreate, MaterialAttributeSelection, MaterialAttributeValueCreate, RateItemCreate, RateOptionCreate


def test_material_rate_item_requires_composition_fields():
    item = RateItemCreate(
        item_type="material",
        main_item=" Concrete ",
        material_name=" Cement ",
        supplier=" Local supplier ",
        brand="Tokyo",
        material_attributes=[
            {"attribute": "Grade", "value": "OPC"},
            {"attribute": "Packing", "value": "50kg bag"},
        ],
        unit_type="bag",
        unit_detail="50kg bag",
        rate=2500,
    )

    assert item.main_item == "Concrete"
    assert item.material_name == "Cement"
    assert item.supplier == "Local supplier"
    assert item.material_attributes[0].attribute == "Grade"
    assert item.material_attributes[0].value == "OPC"
    assert item.rate == 2500


def test_material_rate_item_allows_no_attributes():
    item = RateItemCreate(
        item_type="material",
        main_item="Concrete",
        material_name="Cement",
        unit_type="bag",
        rate=2500,
    )

    assert item.material_attributes == []


def test_labour_rate_item_requires_name():
    item = RateItemCreate(
        item_type="labour",
        main_item="Concrete",
        labour_name="Mason",
        labour_group="Skilled",
        unit_type="day",
        unit_detail="8-hour day",
        rate=4500,
    )

    assert item.labour_name == "Mason"
    assert item.labour_group == "Skilled"


def test_machinery_rate_item_requires_name():
    item = RateItemCreate(
        item_type="machinery",
        main_item="Concrete",
        machinery_name="Mixer",
        machinery_source="Own",
        unit_type="day",
        rate=8000,
    )

    assert item.machinery_name == "Mixer"
    assert item.machinery_source == "Own"


def test_material_rate_item_rejects_missing_material_name():
    with pytest.raises(ValidationError):
        RateItemCreate(
            item_type="material",
            main_item="Concrete",
            material_name=" ",
            unit_type="bag",
            rate=2500,
        )


def test_labour_rate_item_rejects_missing_labour_name():
    with pytest.raises(ValidationError):
        RateItemCreate(
            item_type="labour",
            main_item="Concrete",
            unit_type="day",
            rate=4500,
        )


def test_machinery_rate_item_rejects_missing_machinery_name():
    with pytest.raises(ValidationError):
        RateItemCreate(
            item_type="machinery",
            main_item="Concrete",
            unit_type="day",
            rate=8000,
        )


def test_rate_item_rejects_negative_rate():
    with pytest.raises(ValidationError):
        RateItemCreate(
            item_type="material",
            main_item="Concrete",
            material_name="Cement",
            unit_type="bag",
            rate=-1,
        )


def test_rate_item_requires_unit_type():
    with pytest.raises(ValidationError):
        RateItemCreate(
            item_type="material",
            main_item="Concrete",
            material_name="Cement",
            unit_type="",
            rate=1,
        )


def test_rate_option_trims_value():
    option = RateOptionCreate(option_type="main_item", value=" Concrete ")

    assert option.value == "Concrete"


def test_old_material_type_is_rejected():
    with pytest.raises(ValidationError):
        RateItemCreate(
            item_type="material",
            main_item="Concrete",
            material_name="Cement",
            material_type="OPC",
            unit_type="bag",
            rate=2500,
        )


def test_material_attribute_selection_trims_values():
    selection = MaterialAttributeSelection(attribute=" Diameter ", value=" 12mm ")

    assert selection.attribute == "Diameter"
    assert selection.value == "12mm"


def test_material_attribute_catalog_models_trim_values():
    attribute = MaterialAttributeCreate(material_name=" Steel ", name=" Diameter ")
    value = MaterialAttributeValueCreate(value=" 16mm ")

    assert attribute.material_name == "Steel"
    assert attribute.name == "Diameter"
    assert value.value == "16mm"
