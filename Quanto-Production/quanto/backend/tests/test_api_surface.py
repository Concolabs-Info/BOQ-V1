from app.main import app


def test_required_pre_routes_exist():
    paths = set(app.openapi()["paths"])
    expected = {
        "/api/v1/projects",
        "/api/v1/projects/{project_id}/documents",
        "/api/v1/projects/{project_id}/triage",
        "/api/v1/projects/{project_id}/pre",
        "/api/v1/viewports/{viewport_id}/scale/suggest",
        "/api/v1/projects/{project_id}/heights/suggest",
        "/api/v1/projects/{project_id}/specs/extract",
        "/api/v1/projects/{project_id}/pre/freeze",
        "/api/v1/projects/{project_id}/takeoff/floor/demo-state",
        "/api/v1/projects/{project_id}/takeoff/floor/analyze",
        "/api/v1/projects/{project_id}/takeoff/ceiling/demo-state",
        "/api/v1/projects/{project_id}/takeoff/ceiling/analyze",
        "/api/v1/projects/{project_id}/takeoff/roof/demo-state",
        "/api/v1/projects/{project_id}/takeoff/roof/analyze",
        "/api/v1/projects/{project_id}/roofs",
        "/api/v1/projects/{project_id}/roofs/import-json",
    }
    assert expected.issubset(paths)
