from app.core.rbac import (
    PERMISSION_MATRIX,
    slug_to_custom_role_key,
    unique_custom_role_key,
    permissions_for_role,
    sanitize_custom_permissions,
)


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


def test_custom_role_keys_are_local_not_clerk():
    assert slug_to_custom_role_key("Site QS") == "custom_site_qs"
    assert unique_custom_role_key("Site QS", ["custom_site_qs"]) == "custom_site_qs_2"


def test_custom_permissions_drop_billing():
    assert "billing:manage" not in sanitize_custom_permissions(["boq:view", "billing:manage"])
    assert sanitize_custom_permissions(["boq:view", "boq:view"]) == ["boq:view"]


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
