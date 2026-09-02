from app.modules.takeoff.scope.registry import get_scope_spec, supported_elements


def test_all_planned_takeoff_elements_have_scope_specs():
    assert supported_elements() == [
        "columns",
        "beams",
        "slab",
        "floor",
        "ceiling",
        "doors-windows",
        "walls",
        "roof",
        "stairs-ramps",
        "foundation",
    ]


def test_scope_dependency_contract_matches_master_plan():
    columns = get_scope_spec("columns")
    assert [(d.fact_type, d.publisher_element, d.required) for d in columns.dependencies] == [
        ("beam_solid", "beams", True),
        ("slab_solid", "slab", True),
        ("pad_top_level", "foundation", False),
    ]
    assert get_scope_spec("beams").dependencies == ()
    assert get_scope_spec("slab").dependencies[0].fact_type == "beam_solid"
    assert get_scope_spec("ceiling").floor_geometry_fallback is True


def test_scope_source_roles_match_planning_constraints():
    assert get_scope_spec("roof").primary_view_kinds == ("plan",)
    assert get_scope_spec("foundation").one_primary_per_group is True
    assert get_scope_spec("stairs-ramps").require_every_level is False


def test_typical_viewport_can_apply_to_multiple_confirmed_storeys():
    from app.modules.takeoff.scope.engine import _matching_levels

    viewport = {"id": "vp-typical", "level_label": "Typical Floors"}
    levels = [
        {"id": "l2", "name": "Level 2", "typical_group": "Typical Floors", "source_viewport_id": "vp-typical"},
        {"id": "l3", "name": "Level 3", "typical_group": "Typical Floors", "source_viewport_id": "vp-typical"},
    ]
    assert [level["id"] for level in _matching_levels(viewport, levels)] == ["l2", "l3"]


def test_column_range_labels_map_to_non_overlapping_storey_lifts():
    from app.modules.takeoff.scope.engine import _column_span_levels

    levels = [
        {"id": "l1", "name": "FIRST FLOOR", "level_index": 0},
        {"id": "l2", "name": "SECOND FLOOR", "level_index": 1},
        {"id": "l3", "name": "THIRD FLOOR", "level_index": 2},
        {"id": "roof", "name": "ROOF TERRACE", "level_index": 3},
    ]
    lower = {"name": "GENERAL ARRANGEMENT OF COLUMNS & WALLS UPTO 1st FLOOR", "level_label": "UPTO 1st FLOOR"}
    upper = {"name": "GENERAL ARRANGEMENT OF COLUMNS & WALLS 1st FLOOR UPTO ROOF TERRACE", "level_label": "1st FLOOR UPTO ROOF TERRACE"}

    assert [level["id"] for level in _column_span_levels(lower, levels)] == ["l1"]
    assert [level["id"] for level in _column_span_levels(upper, levels)] == ["l2", "l3", "roof"]


def test_columns_prefer_dedicated_column_layouts_over_incidental_column_subjects():
    from app.modules.takeoff.scope.engine import _primary_candidates

    frame = {"sheets": [], "viewports": [
        {"id": "dedicated", "name": "Columns & walls 1st floor to roof", "view_kind": "plan", "discipline": "structural", "subjects": ["column", "structural_wall"]},
        {"id": "slab", "name": "Typical suspended slab", "view_kind": "plan", "discipline": "structural", "subjects": ["column", "beam", "slab"]},
    ]}
    candidates, _ = _primary_candidates(frame, get_scope_spec("columns"))
    assert [candidate["id"] for candidate in candidates] == ["dedicated"]
