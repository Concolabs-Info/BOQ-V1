"""Company profile for settings. Clerk is not involved."""
from __future__ import annotations

import hashlib
import shutil
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from .roles import permissions_for_membership
from ...database.connection import execute, fetch_one
from ...services.storage.paths import company_dir, key_for, resolve_key, root
from .invitations import InvitationError
from .membership import CompanyMembership, company_logo_url
from .onboarding import COUNTRY_CURRENCY, currency_for_country

MAX_LOGO_BYTES = 5 * 1024 * 1024
MAX_LOGO_EDGE = 512
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}


def get_company(membership: CompanyMembership) -> dict:
    row = fetch_one(
        "SELECT id, name, domain, registration_type, registration_number, tax_id, country, currency, phone, logo_storage_key "
        "FROM company WHERE id = %s",
        (membership.company_id,),
    )
    if not row:
        raise InvitationError("invalid", "Company not found.")
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "domain": row["domain"],
        "registration_type": row["registration_type"],
        "registration_number": row["registration_number"],
        "tax_id": row["tax_id"],
        "country": row["country"],
        "currency": row["currency"],
        "phone": row["phone"],
        "logo_url": company_logo_url(row.get("logo_storage_key")),
        "role": membership.role,
        "permissions": permissions_for_membership(membership),
    }


def update_company(membership: CompanyMembership, *, name: str, country: str, tax_id: str | None = None, phone: str | None = None) -> dict:
    clean_name = name.strip()
    clean_country = country.strip() or "Sri Lanka"
    if not clean_name:
        raise InvitationError("invalid", "Enter a company name.")
    currency = COUNTRY_CURRENCY.get(clean_country) or currency_for_country(clean_country)
    execute(
        "UPDATE company SET name = %s, country = %s, currency = %s, tax_id = %s, phone = %s WHERE id = %s",
        (clean_name, clean_country, currency, (tax_id or "").strip() or None, (phone or "").strip() or None, membership.company_id),
    )
    return get_company(membership)


def normalize_company_logo(data: bytes) -> bytes:
    if not data:
        raise InvitationError("invalid", "Choose a photo to upload.")
    if len(data) > MAX_LOGO_BYTES:
        raise InvitationError("invalid", "Choose an image under 5 MB.")
    try:
        image = Image.open(BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise InvitationError("invalid", "Choose a PNG, JPEG, or WebP image.") from exc
    if image.format not in ALLOWED_FORMATS:
        raise InvitationError("invalid", "Choose a PNG, JPEG, or WebP image.")
    image = image.convert("RGBA")
    image.thumbnail((MAX_LOGO_EDGE, MAX_LOGO_EDGE))
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _clear_logo_files(company_id: str, storage_key: str | None = None, keep: Path | None = None) -> None:
    keep_resolved = keep.resolve() if keep else None
    if storage_key:
        try:
            path = resolve_key(storage_key)
            if keep_resolved is None or path.resolve() != keep_resolved:
                path.unlink(missing_ok=True)
        except ValueError:
            pass
    folder = root() / "company" / str(company_id)
    if not folder.is_dir():
        return
    for path in folder.glob("logo*"):
        if keep_resolved and path.resolve() == keep_resolved:
            continue
        path.unlink(missing_ok=True)


def purge_company_files(company_id: str) -> None:
    folder = root() / "company" / str(company_id)
    if folder.is_dir():
        shutil.rmtree(folder, ignore_errors=True)


def save_company_logo(membership: CompanyMembership, data: bytes) -> dict:
    png = normalize_company_logo(data)
    current = fetch_one("SELECT logo_storage_key FROM company WHERE id = %s", (membership.company_id,))
    old_key = (current or {}).get("logo_storage_key")
    path = company_dir(membership.company_id) / f"logo-{hashlib.sha256(png).hexdigest()[:16]}.png"
    path.write_bytes(png)
    execute(
        "UPDATE company SET logo_storage_key = %s WHERE id = %s",
        (key_for(path), membership.company_id),
    )
    _clear_logo_files(membership.company_id, old_key, keep=path)
    return get_company(membership)


def remove_company_logo(membership: CompanyMembership) -> dict:
    current = fetch_one("SELECT logo_storage_key FROM company WHERE id = %s", (membership.company_id,))
    execute("UPDATE company SET logo_storage_key = NULL WHERE id = %s", (membership.company_id,))
    _clear_logo_files(membership.company_id, (current or {}).get("logo_storage_key"))
    return get_company(membership)


def company_logo_path(membership: CompanyMembership) -> Path | None:
    row = fetch_one("SELECT logo_storage_key FROM company WHERE id = %s", (membership.company_id,))
    storage_key = (row or {}).get("logo_storage_key") if row else None
    if not storage_key:
        return None
    try:
        path = resolve_key(storage_key)
    except ValueError:
        return None
    return path if path.is_file() else None
