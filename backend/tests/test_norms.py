import pytest
from pydantic import ValidationError

from uuid import uuid4

from app.api.v1.routes import norms as norms_route
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


def test_rate_breakdown_percentage_row_accepts_rate_selection():
    rate_item_id = uuid4()
    row = RateBreakdownRowInput(item_type="percentage", description="Allowance", quantity=2.5, rate_item_id=rate_item_id, selected_rate=2.5, selected_rate_label="Tools")

    assert row.rate_item_id == rate_item_id
    assert row.selected_rate == 2.5
    assert row.selected_rate_label == "Tools"
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


def test_rate_breakdown_manual_rate_creates_rate_file_item(monkeypatch):
    project_id = uuid4()
    rate_file_id = uuid4()
    rate_item_id = uuid4()
    executed: list[tuple[str, tuple[object, ...]]] = []

    class _Result:
        def __init__(self, row=None):
            self.row = row

        def fetchone(self):
            return self.row

    class _Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            if "INSERT INTO rate_item" in sql:
                return _Result({
                    "id": rate_item_id,
                    "item_type": "material",
                    "material_name": "3/4\" Metal",
                    "supplier": None,
                    "brand": None,
                    "material_attributes": [],
                    "unit_type": "cube",
                    "unit_detail": "0.5 cube",
                    "rate": 30000,
                })
            return _Result()

    row = RateBreakdownRowInput(item_type="material", description="3/4\" Metal", quantity=0.5, unit="cube", selected_rate=30000)
    built = norms_route._build_breakdown_rows(project_id, rate_file_id, [row], _Connection())

    assert built[0]["rate_item_id"] == str(rate_item_id)
    assert built[0]["selected_rate"] == 30000
    assert built[0]["amount"] == 15000
    assert any("INSERT INTO rate_item" in sql and params[-3] == "cube" and params[-2] == "0.5 cube" for sql, params in executed)
    assert any("INSERT INTO rate_option" in sql and params[1] == "material_name" for sql, params in executed)
    assert any("INSERT INTO rate_option" in sql and params[1] == "material_unit_type" for sql, params in executed)


def test_rate_breakdown_manual_labor_rate_copies_unit_detail():
    project_id = uuid4()
    rate_file_id = uuid4()
    executed: list[tuple[str, tuple[object, ...]]] = []

    class _Result:
        def __init__(self, row=None):
            self.row = row

        def fetchone(self):
            return self.row

    class _Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            if "INSERT INTO rate_item" in sql:
                return _Result({
                    "id": uuid4(),
                    "item_type": "labour",
                    "labour_name": "Skilled labor",
                    "labour_group": None,
                    "unit_type": "day",
                    "unit_detail": "2 day",
                    "rate": 500,
                })
            return _Result()

    row = RateBreakdownRowInput(item_type="labor", description="Skilled labor", quantity=2, unit="day", selected_rate=500)
    norms_route._build_breakdown_rows(project_id, rate_file_id, [row], _Connection())

    assert any("INSERT INTO rate_item" in sql and params[-3] == "day" and params[-2] == "2 day" for sql, params in executed)


def test_rate_breakdown_manual_machinery_rate_copies_unit_detail():
    project_id = uuid4()
    rate_file_id = uuid4()
    executed: list[tuple[str, tuple[object, ...]]] = []

    class _Result:
        def __init__(self, row=None):
            self.row = row

        def fetchone(self):
            return self.row

    class _Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            if "INSERT INTO rate_item" in sql:
                return _Result({
                    "id": uuid4(),
                    "item_type": "machinery",
                    "machinery_name": "Mixer",
                    "machinery_source": None,
                    "machinery_location": None,
                    "unit_type": "hour",
                    "unit_detail": "3 hour",
                    "rate": 1200,
                })
            return _Result()

    row = RateBreakdownRowInput(item_type="machinery", description="Mixer", quantity=3, unit="hour", selected_rate=1200)
    norms_route._build_breakdown_rows(project_id, rate_file_id, [row], _Connection())

    assert any("INSERT INTO rate_item" in sql and params[-3] == "hour" and params[-2] == "3 hour" for sql, params in executed)


def test_rate_breakdown_percentage_linked_rate_uses_previous_subtotal(monkeypatch):
    project_id = uuid4()
    rate_file_id = uuid4()
    percentage_rate_id = uuid4()

    def fake_require_rate_item(project_id_arg, rate_file_id_arg, rate_item_id_arg):
        assert project_id_arg == project_id
        assert rate_file_id_arg == rate_file_id
        assert rate_item_id_arg == percentage_rate_id
        return {
            "id": percentage_rate_id,
            "item_type": "percentage",
            "percentage_name": "Tools",
            "percentage": 2.5,
            "rate": None,
        }

    monkeypatch.setattr(norms_route, "_require_rate_item", fake_require_rate_item)

    rows = [
        RateBreakdownRowInput(item_type="labor", description="Skilled labor", quantity=1, unit="day", selected_rate=65),
        RateBreakdownRowInput(item_type="labor", description="Unskilled labor", quantity=2, unit="day", selected_rate=500),
        RateBreakdownRowInput(item_type="percentage", description="Tools", quantity=99, rate_item_id=percentage_rate_id),
    ]
    built = norms_route._build_breakdown_rows(project_id, rate_file_id, rows)

    assert built[2]["selected_rate"] == 2.5
    assert built[2]["selected_rate_label"] == "Tools - 2.5%"
    assert built[2]["amount"] == 26.63


def test_rate_breakdown_percentage_without_selection_stays_unpriced():
    rows = [
        RateBreakdownRowInput(item_type="labor", description="Skilled labor", quantity=1, unit="day", selected_rate=65),
        RateBreakdownRowInput(item_type="percentage", description="Tools", quantity=2.5),
    ]
    built = norms_route._build_breakdown_rows(uuid4(), uuid4(), rows)

    assert built[1]["selected_rate"] is None
    assert built[1]["amount"] is None


def test_rate_breakdown_manual_percentage_creates_rate_file_item():
    project_id = uuid4()
    rate_file_id = uuid4()
    rate_item_id = uuid4()
    executed: list[tuple[str, tuple[object, ...]]] = []

    class _Result:
        def __init__(self, row=None):
            self.row = row

        def fetchone(self):
            return self.row

    class _Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            if "INSERT INTO rate_item" in sql:
                if len(params) == 5:
                    return _Result({
                        "id": rate_item_id,
                        "item_type": "percentage",
                        "percentage_name": "Tools",
                        "percentage": 2.5,
                        "rate": None,
                    })
                return _Result({
                    "id": uuid4(),
                    "item_type": "labour",
                    "labour_name": "Skilled labor",
                    "labour_group": None,
                    "unit_type": "day",
                    "unit_detail": None,
                    "rate": 65,
                })
            return _Result()

    rows = [
        RateBreakdownRowInput(item_type="labor", description="Skilled labor", quantity=1, unit="day", selected_rate=65),
        RateBreakdownRowInput(item_type="percentage", description="Tools", quantity=0, selected_rate=2.5),
    ]
    built = norms_route._build_breakdown_rows(project_id, rate_file_id, rows, _Connection())

    assert built[1]["rate_item_id"] == str(rate_item_id)
    assert built[1]["selected_rate"] == 2.5
    assert built[1]["selected_rate_label"] == "Tools - 2.5%"
    assert built[1]["amount"] == 1.63
    assert any("INSERT INTO rate_item" in sql and params[3] == "Tools" and params[4] == 2.5 for sql, params in executed)
    assert any("INSERT INTO rate_item" in sql and len(params) == 5 for sql, params in executed)
