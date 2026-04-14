# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for FilesHandler"""

from pathlib import Path

import pytest

from app.handlers import FilesHandler
from app.handlers.files_handler import (
    extract_workspace_and_filename,
    get_common_folders,
    search_folder_in_home,
)


@pytest.fixture(name="files_handler")
def _files_handler() -> FilesHandler:
    return FilesHandler()


def test_read_returns_file_contents(files_handler: FilesHandler, tmp_path: Path) -> None:
    """read returns the bytes of a file at the given full path."""
    file = tmp_path / "file.pdf"
    file.write_bytes(b"pdf-content")
    assert files_handler.read(file) == b"pdf-content"


def test_read_missing_file_raises(files_handler: FilesHandler, tmp_path: Path) -> None:
    """read raises FileNotFoundError for a missing file."""
    with pytest.raises(FileNotFoundError):
        files_handler.read(tmp_path / "missing.pdf")


def test_write_creates_file(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write creates a file in the same directory as the given path."""
    result = files_handler.write(tmp_path / "merged.pdf", b"pdf-content")
    assert result.name == "merged.pdf"
    assert (tmp_path / "merged.pdf").read_bytes() == b"pdf-content"


def test_write_with_suffix_and_ext(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write appends suffix to stem and overrides extension."""
    result = files_handler.write(
        tmp_path / "a.pdf", b"docx-content", stem_suffix="converted", ext="docx"
    )
    assert result.name == "a-converted.docx"
    assert (tmp_path / "a-converted.docx").read_bytes() == b"docx-content"


def test_write_increments_when_file_exists(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write creates incremental filenames when base file already exists."""
    (tmp_path / "merged.pdf").write_bytes(b"existing")
    result = files_handler.write(tmp_path / "merged.pdf", b"new-content")
    assert result.name == "merged(1).pdf"
    assert (tmp_path / "merged(1).pdf").read_bytes() == b"new-content"


def test_write_increments_multiple_times(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write continues incrementing until it finds an available filename."""
    (tmp_path / "file.pdf").write_bytes(b"v0")
    (tmp_path / "file(1).pdf").write_bytes(b"v1")
    (tmp_path / "file(2).pdf").write_bytes(b"v2")

    result = files_handler.write(tmp_path / "file.pdf", b"v3")
    assert result.name == "file(3).pdf"
    assert (tmp_path / "file(3).pdf").read_bytes() == b"v3"


def test_write_increments_with_suffix(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write increments correctly when stem_suffix is used."""
    (tmp_path / "doc-converted.pdf").write_bytes(b"existing")
    result = files_handler.write(tmp_path / "doc.pdf", b"new", stem_suffix="converted")
    assert result.name == "doc-converted(1).pdf"
    assert (tmp_path / "doc-converted(1).pdf").read_bytes() == b"new"


def test_list_files_returns_all_files(files_handler: FilesHandler, tmp_path: Path) -> None:
    """list_files returns all files in the given folder."""
    (tmp_path / "a.pdf").write_bytes(b"pdf")
    (tmp_path / "b.txt").touch()
    assert {f.name for f in files_handler.list_files(tmp_path)} == {"a.pdf", "b.txt"}


def test_list_files_filters_by_extension(files_handler: FilesHandler, tmp_path: Path) -> None:
    """list_files returns only files matching the given extension."""
    (tmp_path / "a.pdf").write_bytes(b"pdf")
    (tmp_path / "b.txt").touch()
    result = files_handler.list_files(tmp_path, "pdf")
    assert [f.name for f in result] == ["a.pdf"]


def test_list_files_raises_for_nonexistent_folder(
    files_handler: FilesHandler, tmp_path: Path
) -> None:
    """list_files raises FileNotFoundError for a missing folder."""
    with pytest.raises(FileNotFoundError):
        files_handler.list_files(tmp_path / "nonexistent")


# extract_workspace_and_filename tests


def test_extract_workspace_and_filename_absolute_path(tmp_path: Path) -> None:
    """extract_workspace_and_filename handles absolute paths."""
    file_path = tmp_path / "document.pdf"
    workspace, filename = extract_workspace_and_filename(file_path)
    assert workspace == tmp_path.resolve()
    assert filename == Path("document.pdf")


def test_extract_workspace_and_filename_relative_path_with_dirs() -> None:
    """extract_workspace_and_filename handles relative paths with directories."""
    file_path = Path("docs/document.pdf")
    workspace, filename = extract_workspace_and_filename(file_path)
    assert workspace.is_absolute()
    assert filename == Path("document.pdf")


def test_extract_workspace_and_filename_bare_filename_raises() -> None:
    """extract_workspace_and_filename raises ValueError for bare filenames."""
    with pytest.raises(ValueError, match="Please provide full path including directory"):
        extract_workspace_and_filename(Path("document.pdf"))


def test_get_common_folders() -> None:
    """get_common_folders returns expected folder list."""
    folders = get_common_folders()
    assert len(folders) == 4
    assert all(f.is_absolute() for f in folders)
    folder_names = [f.name for f in folders]
    assert "Downloads" in folder_names
    assert "Documents" in folder_names
    assert "Desktop" in folder_names
    assert "Pictures" in folder_names


def test_search_folder_in_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """search_folder_in_home finds folders in home directory."""
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    downloads = fake_home / "Downloads"
    downloads.mkdir()

    monkeypatch.setattr(Path, "home", lambda: fake_home)

    found = search_folder_in_home("Downloads")
    assert found == downloads


def test_search_folder_in_home_case_insensitive(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """search_folder_in_home is case-insensitive for common folders."""
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    downloads = fake_home / "Downloads"
    downloads.mkdir()

    monkeypatch.setattr(Path, "home", lambda: fake_home)

    found = search_folder_in_home("downloads")
    assert found is not None
    assert found.name in ("downloads", "Downloads")
    assert found.parent == fake_home


def test_search_folder_in_home_not_found(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """search_folder_in_home returns None when folder not found."""
    fake_home = tmp_path / "home"
    fake_home.mkdir()

    monkeypatch.setattr(Path, "home", lambda: fake_home)

    found = search_folder_in_home("NonExistent")
    assert found is None


def test_extract_workspace_and_filename_with_folder_name(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """extract_workspace_and_filename resolves folder names from home."""
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    downloads = fake_home / "Downloads"
    downloads.mkdir()

    monkeypatch.setattr(Path, "home", lambda: fake_home)

    workspace, filename = extract_workspace_and_filename(Path("Downloads/document.pdf"))
    assert workspace == downloads
    assert filename == Path("document.pdf")


def test_extract_workspace_and_filename_with_subfolder(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """extract_workspace_and_filename handles subfolders in common folders."""
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    desktop = fake_home / "Desktop"
    desktop.mkdir()
    project = desktop / "my-project"
    project.mkdir()

    monkeypatch.setattr(Path, "home", lambda: fake_home)

    workspace, filename = extract_workspace_and_filename(Path("Desktop/my-project/file.pdf"))
    assert workspace == project
    assert filename == Path("file.pdf")
