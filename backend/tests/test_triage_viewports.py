from app.modules.pre.triage import _deduplicate_viewports


def test_deduplicate_same_title_only_when_boxes_overlap():
    first = {"name": "SECTION A-A", "view_kind": "section", "box": {"x1": 100, "y1": 100, "x2": 400, "y2": 400}}
    duplicate = {"name": " Section   A-A ", "view_kind": "section", "box": {"x1": 105, "y1": 105, "x2": 395, "y2": 395}}
    separate = {"name": "SECTION A-A", "view_kind": "section", "box": {"x1": 600, "y1": 100, "x2": 900, "y2": 400}}

    assert _deduplicate_viewports([first, duplicate, separate]) == [first, separate]
