# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for FilesHandler"""

from pathlib import Path

import pytest

from app.handlers import FilesHandler


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
