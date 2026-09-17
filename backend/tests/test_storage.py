from __future__ import annotations

import pytest

from app.core.config import get_settings
from app.services.storage.paths import crops_dir, key_for, resolve_key, source_dir


def test_storage_keys_stay_inside_root(tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path))
    get_settings.cache_clear()
    try:
        source = source_dir("project-1") / "drawing.pdf"
        source.write_bytes(b"%PDF-")
        assert resolve_key(key_for(source)) == source.resolve()
        assert crops_dir("project-1").is_dir()
        from app.services.storage.paths import company_dir
        assert company_dir("c1").is_dir()
        with pytest.raises(ValueError):
            resolve_key("../outside.txt")
    finally:
        get_settings.cache_clear()
