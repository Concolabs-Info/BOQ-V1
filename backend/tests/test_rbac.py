from app.core.rbac import PERMISSION_MATRIX, permissions_for_role


def test_admin_has_every_permission():
    assert set(permissions_for_role("admin")) == set(PERMISSION_MATRIX.keys())


def test_viewer_only_sees_boq_view():
    assert permissions_for_role("viewer") == ["boq:view"]


def test_technician_can_run_the_pipeline_but_not_manage_rates():
    perms = permissions_for_role("technician")
    assert "pipeline:start_takeoff" in perms
    assert "boq:rates_manage" not in perms


def test_unknown_role_has_no_permissions():
    assert permissions_for_role("made_up_role") == []
