from app.modules.pre.specifications import _deduplicate, _useful


def item(**overrides):
    value = {
        "page_id": "page-1",
        "kind": "note",
        "name": "Concrete grades",
        "raw_text": "Concrete in columns shall be Grade 30.",
        "bbox_mpt": [100, 100, 500, 400],
        "table": None,
    }
    value.update(overrides)
    return value


def test_duplicate_specification_blocks_are_collapsed():
    duplicate = item(bbox_mpt=[102, 101, 502, 401])
    assert len(_deduplicate([item(), duplicate])) == 1


def test_same_heading_on_different_pages_is_retained():
    assert len(_deduplicate([item(), item(page_id="page-2")])) == 2


def test_isolated_level_labels_are_not_spec_items():
    assert not _useful(item(kind="level_datum", name="FIRST FLOOR LEVEL", raw_text="FIRST FLOOR LEVEL +13'-6\""))
    assert _useful(item(kind="level_datum", name="Level schedule", raw_text="Level schedule", table={"columns": ["Level"], "rows": []}))
