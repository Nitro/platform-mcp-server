# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for FilesHandler"""

from pathlib import Path

import pytest

from app.handlers import FilesHandler, PathTraversalError, WorkspaceNotSetError
from app.handlers.files_handler import (
    extract_workspace_and_filename,
    get_common_folders,
    search_folder_in_home,
)


@pytest.fixture(name="files_handler")
def _files_handler(tmp_path: Path) -> FilesHandler:
    return FilesHandler(tmp_path)


def test_read_returns_file_contents(files_handler: FilesHandler, tmp_path: Path) -> None:
    """read returns the bytes of a file within the workspace."""
    (tmp_path / "file.pdf").write_bytes(b"pdf-content")
    assert files_handler.read(Path("file.pdf")) == b"pdf-content"


def test_read_missing_file_raises(files_handler: FilesHandler) -> None:
    """read raises FileNotFoundError for a missing file."""
    with pytest.raises(FileNotFoundError):
        files_handler.read(Path("missing.pdf"))


def test_read_path_traversal_raises(files_handler: FilesHandler) -> None:
    """read raises PathTraversalError when path escapes the workspace."""
    with pytest.raises(PathTraversalError):
        files_handler.read(Path("../../etc/passwd"))


def test_write_creates_file(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write creates a file with the given filename."""
    result = files_handler.write("merged.pdf", b"pdf-content")
    assert result.name == "merged.pdf"
    assert (tmp_path / "merged.pdf").read_bytes() == b"pdf-content"


def test_write_with_suffix_and_ext(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write appends suffix to stem and overrides extension."""
    result = files_handler.write("a.pdf", b"docx-content", stem_suffix="converted", ext="docx")
    assert result.name == "a-converted.docx"
    assert (tmp_path / "a-converted.docx").read_bytes() == b"docx-content"


def test_write_accepts_path(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write accepts a Path as filename."""
    result = files_handler.write(
        Path("a.pdf"), b"docx-content", stem_suffix="converted", ext="docx"
    )
    assert result.name == "a-converted.docx"
    assert (tmp_path / "a-converted.docx").read_bytes() == b"docx-content"


def test_write_custom_sep(files_handler: FilesHandler) -> None:
    """write uses the provided sep between stem and suffix."""
    result = files_handler.write("a.pdf", b"", stem_suffix="converted", ext="docx", sep="_")
    assert result.name == "a_converted.docx"


def test_write_increments_when_file_exists(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write creates incremental filenames when base file already exists."""
    (tmp_path / "merged.pdf").write_bytes(b"existing")
    result = files_handler.write("merged.pdf", b"new-content")
    assert result.name == "merged(1).pdf"
    assert (tmp_path / "merged(1).pdf").read_bytes() == b"new-content"


def test_write_increments_multiple_times(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write continues incrementing until it finds an available filename."""
    (tmp_path / "file.pdf").write_bytes(b"v0")
    (tmp_path / "file(1).pdf").write_bytes(b"v1")
    (tmp_path / "file(2).pdf").write_bytes(b"v2")

    result = files_handler.write("file.pdf", b"v3")
    assert result.name == "file(3).pdf"
    assert (tmp_path / "file(3).pdf").read_bytes() == b"v3"


def test_write_increments_with_suffix(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write increments correctly when stem_suffix is used."""
    (tmp_path / "doc-converted.pdf").write_bytes(b"existing")
    result = files_handler.write("doc.pdf", b"new", stem_suffix="converted")
    assert result.name == "doc-converted(1).pdf"
    assert (tmp_path / "doc-converted(1).pdf").read_bytes() == b"new"


def test_list_files_returns_all_files(files_handler: FilesHandler, tmp_path: Path) -> None:
    """list_files returns all files when no extension filter is given."""
    (tmp_path / "a.pdf").write_bytes(b"pdf")
    (tmp_path / "b.txt").touch()
    assert {f.name for f in files_handler.list_files()} == {"a.pdf", "b.txt"}


def test_list_files_filters_by_extension(files_handler: FilesHandler, tmp_path: Path) -> None:
    """list_files returns only files matching the given extension."""
    (tmp_path / "a.pdf").write_bytes(b"pdf")
    (tmp_path / "b.txt").touch()
    result = files_handler.list_files("pdf")
    assert [f.name for f in result] == ["a.pdf"]


# Workspace management tests


def test_set_workspace_raises_for_nonexistent_directory(tmp_path: Path) -> None:
    """set_workspace raises error if directory doesn't exist."""
    handler = FilesHandler(None)
    workspace = tmp_path / "new_workspace"
    with pytest.raises(ValueError, match="Workspace folder does not exist"):
        handler.set_workspace(workspace)


def test_set_workspace_accepts_existing_directory(tmp_path: Path) -> None:
    """set_workspace accepts an existing directory."""
    handler = FilesHandler(None)
    handler.set_workspace(tmp_path)
    assert handler.workspace == tmp_path.resolve()


def test_set_workspace_raises_for_file_path(tmp_path: Path) -> None:
    """set_workspace raises error if path is a file, not a directory."""
    handler = FilesHandler(None)
    file_path = tmp_path / "file.txt"
    file_path.touch()
    with pytest.raises(ValueError, match="Workspace path must be a directory"):
        handler.set_workspace(file_path)


def test_has_workspace_false_when_not_set() -> None:
    """has_workspace returns False when workspace is not set."""
    handler = FilesHandler(None)
    assert not handler.has_workspace


def test_has_workspace_true_after_set(tmp_path: Path) -> None:
    """has_workspace returns True after set_workspace is called."""
    handler = FilesHandler(None)
    handler.set_workspace(tmp_path)
    assert handler.has_workspace


def test_workspace_property_raises_when_not_set() -> None:
    """workspace property raises WorkspaceNotSetError when not set."""
    handler = FilesHandler(None)
    with pytest.raises(WorkspaceNotSetError):
        _ = handler.workspace


def test_workspace_property_returns_path_when_set(tmp_path: Path) -> None:
    """workspace property returns the workspace path when set."""
    handler = FilesHandler(None)
    handler.set_workspace(tmp_path)
    assert handler.workspace == tmp_path.resolve()


def test_read_raises_when_workspace_not_set() -> None:
    """read raises WorkspaceNotSetError when workspace is not set."""
    handler = FilesHandler(None)
    with pytest.raises(WorkspaceNotSetError):
        handler.read(Path("file.pdf"))


def test_write_raises_when_workspace_not_set() -> None:
    """write raises WorkspaceNotSetError when workspace is not set."""
    handler = FilesHandler(None)
    with pytest.raises(WorkspaceNotSetError):
        handler.write("file.pdf", b"content")


def test_list_files_raises_when_workspace_not_set() -> None:
    """list_files raises WorkspaceNotSetError when workspace is not set."""
    handler = FilesHandler(None)
    with pytest.raises(WorkspaceNotSetError):
        handler.list_files()


def test_set_workspace_can_change_workspace(tmp_path: Path) -> None:
    """set_workspace can change the workspace directory."""
    handler = FilesHandler(None)
    workspace1 = tmp_path / "workspace1"
    workspace1.mkdir()
    workspace2 = tmp_path / "workspace2"
    workspace2.mkdir()

    handler.set_workspace(workspace1)
    assert handler.workspace == workspace1.resolve()

    handler.set_workspace(workspace2)
    assert handler.workspace == workspace2.resolve()


def test_path_traversal_still_blocked_with_dynamic_workspace(tmp_path: Path) -> None:
    """Path traversal protection still works with dynamic workspace."""
    handler = FilesHandler(None)
    handler.set_workspace(tmp_path)
    with pytest.raises(PathTraversalError):
        handler.read(Path("../../etc/passwd"))


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
    # Should resolve to absolute path
    assert workspace.is_absolute()
    assert filename == Path("document.pdf")


def test_extract_workspace_and_filename_bare_filename_raises() -> None:
    """extract_workspace_and_filename raises ValueError for bare filenames."""
    with pytest.raises(ValueError, match="Please provide full path including directory"):
        extract_workspace_and_filename(Path("document.pdf"))


def test_extract_workspace_and_filename_accepts_string() -> None:
    """extract_workspace_and_filename accepts string paths."""
    file_path = "/tmp/docs/document.pdf"  # noqa: S108
    workspace, filename = extract_workspace_and_filename(file_path)
    assert workspace == Path("/tmp/docs").resolve()  # noqa: S108
    assert filename == Path("document.pdf")


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
    # Create a fake home directory with a Downloads folder
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
    # Case insensitive match should find the folder (though path may have different case)
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

    workspace, filename = extract_workspace_and_filename("Downloads/document.pdf")
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

    workspace, filename = extract_workspace_and_filename("Desktop/my-project/file.pdf")
    assert workspace == project
    assert filename == Path("file.pdf")


def test_ensure_workspace_from_path_with_bare_filename_when_workspace_set(
    tmp_path: Path,
) -> None:
    """ensure_workspace_from_path accepts bare filename when workspace already set."""
    handler = FilesHandler(tmp_path)

    filename = handler.ensure_workspace_from_path("document.pdf")
    assert filename == Path("document.pdf")


def test_ensure_workspace_from_path_with_bare_filename_no_workspace_raises() -> None:
    """ensure_workspace_from_path raises error for bare filename without workspace."""
    handler = FilesHandler(None)

    with pytest.raises(WorkspaceNotSetError):
        handler.ensure_workspace_from_path("document.pdf")
