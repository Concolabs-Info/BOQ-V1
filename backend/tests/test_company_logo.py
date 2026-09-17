from io import BytesIO

import pytest
from PIL import Image

from app.modules.platform.company import MAX_LOGO_BYTES, normalize_company_logo, purge_company_files, remove_company_logo, save_company_logo
from app.modules.platform.invitations import InvitationError
from app.modules.platform.membership import CompanyMembership, company_logo_url
from app.services.storage.paths import company_dir, key_for, resolve_key


def _png(size: tuple[int, int] = (32, 32)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, (37, 99, 235)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_company_logo_url_is_none_without_a_key():
    assert company_logo_url(None) is None
    assert company_logo_url("  ") is None


def test_company_logo_url_fingerprints_the_storage_key():
    first = company_logo_url("company/c1/logo.png")
    second = company_logo_url("company/c1/logo-other.png")
    assert first and first.startswith("/api/v1/platform/company/logo?v=")
    assert first != second


def test_normalize_rejects_empty_and_non_images():
    with pytest.raises(InvitationError):
        normalize_company_logo(b"")
    with pytest.raises(InvitationError):
        normalize_company_logo(b"not-an-image")
    with pytest.raises(InvitationError):
        normalize_company_logo(b"x" * (MAX_LOGO_BYTES + 1))


def test_normalize_writes_a_png_thumbnail():
    result = normalize_company_logo(_png((1200, 800)))
    image = Image.open(BytesIO(result))
    assert image.format == "PNG"
    assert max(image.size) <= 512


def test_save_company_logo_stores_png_and_returns_url(tmp_path, monkeypatch):
    membership = CompanyMembership(company_id="c1", company_name="Acme", role="admin")
    stored = {"logo_storage_key": None}
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path))
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setattr(
        "app.modules.platform.company.fetch_one",
        lambda sql, params=(): (
            stored
            if "logo_storage_key" in sql and "name" not in sql
            else {
                "id": "c1",
                "name": "Acme",
                "domain": None,
                "registration_type": "NONE",
                "registration_number": None,
                "tax_id": None,
                "country": "Sri Lanka",
                "currency": "LKR",
                "phone": None,
                "logo_storage_key": stored["logo_storage_key"],
            }
        ),
    )
    monkeypatch.setattr(
        "app.modules.platform.company.execute",
        lambda sql, params=(): stored.update(
            logo_storage_key=None if "logo_storage_key = NULL" in sql else params[0]
        ),
    )
    monkeypatch.setattr(
        "app.modules.platform.company.permissions_for_membership",
        lambda found: ["company:manage"],
    )
    try:
        result = save_company_logo(membership, _png())
        path = resolve_key(stored["logo_storage_key"])
        assert path.is_file()
        assert path.name.startswith("logo-")
        assert stored["logo_storage_key"] == key_for(path)
        assert result["logo_url"].startswith("/api/v1/platform/company/logo?v=")
    finally:
        get_settings.cache_clear()


def test_save_company_logo_replaces_the_previous_file_and_key(tmp_path, monkeypatch):
    membership = CompanyMembership(company_id="c1", company_name="Acme", role="admin")
    stored = {"logo_storage_key": None}
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path))
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setattr(
        "app.modules.platform.company.fetch_one",
        lambda sql, params=(): (
            stored
            if "logo_storage_key" in sql and "name" not in sql
            else {
                "id": "c1",
                "name": "Acme",
                "domain": None,
                "registration_type": "NONE",
                "registration_number": None,
                "tax_id": None,
                "country": "Sri Lanka",
                "currency": "LKR",
                "phone": None,
                "logo_storage_key": stored["logo_storage_key"],
            }
        ),
    )
    monkeypatch.setattr(
        "app.modules.platform.company.execute",
        lambda sql, params=(): stored.update(
            logo_storage_key=None if "logo_storage_key = NULL" in sql else params[0]
        ),
    )
    monkeypatch.setattr(
        "app.modules.platform.company.permissions_for_membership",
        lambda found: ["company:manage"],
    )
    try:
        first = save_company_logo(membership, _png((32, 32)))
        first_path = resolve_key(stored["logo_storage_key"])
        first_key = stored["logo_storage_key"]
        second = save_company_logo(membership, _png((48, 48)))
        second_path = resolve_key(stored["logo_storage_key"])
        assert first_key != stored["logo_storage_key"]
        assert first["logo_url"] != second["logo_url"]
        assert second_path.is_file()
        assert not first_path.exists()
        leftover = list((tmp_path / "company" / "c1").glob("logo*"))
        assert {item.resolve() for item in leftover} == {second_path.resolve()}
    finally:
        get_settings.cache_clear()


def test_remove_company_logo_clears_file_and_database(tmp_path, monkeypatch):
    membership = CompanyMembership(company_id="c1", company_name="Acme", role="admin")
    stored = {"logo_storage_key": None}
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path))
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setattr(
        "app.modules.platform.company.fetch_one",
        lambda sql, params=(): (
            stored
            if "logo_storage_key" in sql and "name" not in sql
            else {
                "id": "c1",
                "name": "Acme",
                "domain": None,
                "registration_type": "NONE",
                "registration_number": None,
                "tax_id": None,
                "country": "Sri Lanka",
                "currency": "LKR",
                "phone": None,
                "logo_storage_key": stored["logo_storage_key"],
            }
        ),
    )
    monkeypatch.setattr(
        "app.modules.platform.company.execute",
        lambda sql, params=(): stored.update(
            logo_storage_key=None if "logo_storage_key = NULL" in sql else params[0]
        ),
    )
    monkeypatch.setattr(
        "app.modules.platform.company.permissions_for_membership",
        lambda found: ["company:manage"],
    )
    try:
        save_company_logo(membership, _png())
        path = resolve_key(stored["logo_storage_key"])
        result = remove_company_logo(membership)
        assert stored["logo_storage_key"] is None
        assert result["logo_url"] is None
        assert not path.exists()
    finally:
        get_settings.cache_clear()


def test_purge_company_files_removes_the_company_folder(tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path))
    from app.core.config import get_settings

    get_settings.cache_clear()
    try:
        folder = company_dir("c1")
        (folder / "logo-old.png").write_bytes(b"x")
        purge_company_files("c1")
        assert not folder.exists()
    finally:
        get_settings.cache_clear()
