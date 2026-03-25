# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for FilesHandler"""

from pathlib import Path

import pytest

from app.handlers import FilesHandler, PathTraversalError


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
    result = files_handler.write("a.pdf", b"docx-content", suffix="converted", ext="docx")
    assert result.name == "a-converted.docx"
    assert (tmp_path / "a-converted.docx").read_bytes() == b"docx-content"


def test_write_raises_if_file_exists(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write raises FileExistsError if the output file already exists."""
    (tmp_path / "merged.pdf").write_bytes(b"existing")
    with pytest.raises(FileExistsError):
        files_handler.write("merged.pdf", b"new-content")


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
