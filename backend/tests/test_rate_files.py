import pytest
from pydantic import ValidationError
from uuid import uuid4

from app.api.v1.routes import rate_files as rate_files_route
from app.api.v1.routes.rate_files import DEFAULT_OPTIONS, MaterialAttributeCreate, MaterialAttributeSelection, MaterialAttributeValueCreate, RateItemCreate, RateOptionCreate, _duplicate_rate_file_name


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
        machinery_location=" Colombo yard ",
        unit_type="day",
        rate=8000,
    )

    assert item.machinery_name == "Mixer"
    assert item.machinery_source == "Own"
    assert item.machinery_location == "Colombo yard"


def test_machinery_rate_item_allows_no_location():
    item = RateItemCreate(
        item_type="machinery",
        main_item="Concrete",
        machinery_name="Mixer",
        machinery_source="Rented",
        unit_type="day",
        rate=8000,
    )

    assert item.machinery_location is None


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


def test_duplicate_rate_file_name_increments():
    name = _duplicate_rate_file_name("Structural rates", {"Structural rates", "Structural rates copy", "Structural rates copy 2"})

    assert name == "Structural rates copy 3"


def test_duplicate_rate_file_name_respects_max_length():
    name = _duplicate_rate_file_name("A" * 200, set())

    assert len(name) == 160
    assert name.endswith(" copy")


def test_duplicate_rate_file_copies_machinery_location(monkeypatch):
    project_id = uuid4()
    rate_file_id = uuid4()
    created_id = uuid4()
    executed: list[tuple[str, tuple[object, ...]]] = []

    monkeypatch.setattr(rate_files_route, "_require_rate_file", lambda *_args: {"name": "Plant rates"})
    monkeypatch.setattr(rate_files_route, "fetch_all", lambda *_args: [{"name": "Plant rates"}])
    monkeypatch.setattr(rate_files_route, "fetch_one", lambda *_args: {"n": 1})

    class _Result:
        def __init__(self, row=None):
            self.row = row

        def fetchone(self):
            return self.row

    class _Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            if "INSERT INTO rate_file" in sql:
                return _Result({"id": created_id, "project_id": project_id, "name": "Plant rates copy"})
            return _Result()

    class _Transaction:
        def __enter__(self):
            return _Connection()

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(rate_files_route, "transaction", lambda: _Transaction())

    result = rate_files_route.duplicate_rate_file(project_id, rate_file_id)
    copy_sql = next(sql for sql, _params in executed if "INSERT INTO rate_item" in sql)

    assert "machinery_location" in copy_sql
    assert result["item_count"] == 1


def test_unit_options_are_category_specific():
    material_option = RateOptionCreate(option_type="material_unit_type", value=" m3 ")
    labour_option = RateOptionCreate(option_type="labour_unit_type", value=" hour ")
    machinery_option = RateOptionCreate(option_type="machinery_unit_type", value=" shift ")

    assert material_option.value == "m3"
    assert labour_option.value == "hour"
    assert machinery_option.value == "shift"
    assert "unit_type" not in DEFAULT_OPTIONS
    assert {"material_unit_type", "labour_unit_type", "machinery_unit_type"}.issubset(DEFAULT_OPTIONS)


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
