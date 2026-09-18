from __future__ import annotations

import pytest

from app.core.config import get_settings
from app.services.storage.paths import crops_dir, key_for, project_root, purge_project_files, resolve_key, source_dir


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


def test_purge_project_files_removes_the_whole_project_folder(tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path))
    get_settings.cache_clear()
    try:
        source = source_dir("project-2") / "drawing.pdf"
        source.write_bytes(b"%PDF-")
        crops_dir("project-2")
        folder = project_root("project-2")
        assert folder.is_dir()

        purge_project_files("project-2")

        assert not folder.exists()
    finally:
        get_settings.cache_clear()


def test_purge_project_files_is_a_no_op_when_nothing_was_ever_uploaded(tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path))
    get_settings.cache_clear()
    try:
        purge_project_files("never-had-any-files")
    finally:
        get_settings.cache_clear()
