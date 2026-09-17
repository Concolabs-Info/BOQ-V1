from app.core.rbac import (
    ASSIGNABLE_ROLES,
    DEFAULT_INVITE_ROLE,
    PERMISSION_MATRIX,
    ROLES,
    is_project_scoped,
    permissions_for_role,
    sanitize_custom_permissions,
    slug_to_custom_role_key,
    unique_custom_role_key,
)


def test_admin_has_every_permission():
    assert set(permissions_for_role("admin")) == set(PERMISSION_MATRIX.keys())


def test_built_in_roles_are_admin_plus_four_working_roles():
    assert ROLES == ["admin", "chief_estimator", "qs", "qa_checker", "project_manager"]
    assert ASSIGNABLE_ROLES == ["chief_estimator", "qs", "qa_checker", "project_manager"]
    assert DEFAULT_INVITE_ROLE == "qs"
    assert is_project_scoped("qs")
    assert is_project_scoped("custom_site_qs")
    assert not is_project_scoped("admin")


def test_qs_can_run_the_pipeline_but_not_manage_rates():
    perms = permissions_for_role("qs")
    assert "pipeline:start_takeoff" in perms
    assert "takeoff:edit" in perms
    assert "boq:export" in perms
    assert "boq:rates_manage" not in perms
    assert "members:manage" not in perms


def test_qa_checker_verifies_but_does_not_measure():
    perms = permissions_for_role("qa_checker")
    assert "review:confirm" in perms
    assert "takeoff:resolve_dispute" in perms
    assert "takeoff:edit" not in perms
    assert "pipeline:upload" not in perms


def test_project_manager_can_export_but_not_edit_takeoff():
    perms = permissions_for_role("project_manager")
    assert "boq:view" in perms
    assert "boq:export" in perms
    assert "takeoff:view" in perms
    assert "takeoff:edit" not in perms
    assert "pipeline:start_takeoff" not in perms


def test_unknown_role_has_no_permissions():
    assert permissions_for_role("made_up_role") == []
    assert permissions_for_role("viewer") == []
    assert permissions_for_role("technician") == []


def test_custom_role_keys_are_local_not_clerk():
    assert slug_to_custom_role_key("Site QS") == "custom_site_qs"
    assert unique_custom_role_key("Site QS", ["custom_site_qs"]) == "custom_site_qs_2"


def test_custom_permissions_drop_billing():
    assert "billing:manage" not in sanitize_custom_permissions(["boq:view", "billing:manage"])
    assert sanitize_custom_permissions(["boq:view", "boq:view"]) == ["boq:view"]
