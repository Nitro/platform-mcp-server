# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for FilesHandler"""

from pathlib import Path

import pytest
from freezegun import freeze_time

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


@freeze_time("2026-01-01T12:00:00+00:00")
def test_write_timestamped_creates_file(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write_timestamped creates a file with the expected timestamped name."""
    result = files_handler.write_timestamped("converted", "output", "docx", b"docx-content")
    assert result.name == "converted-output-2026-01-01T120000.docx"
    assert (tmp_path / "converted-output-2026-01-01T120000.docx").read_bytes() == b"docx-content"


@freeze_time("2026-01-01T12:00:00+00:00")
def test_write_timestamped_custom_sep(files_handler: FilesHandler, tmp_path: Path) -> None:
    """write_timestamped respects a custom separator."""
    result = files_handler.write_timestamped(
        "converted", "output", "docx", b"docx-content", sep="_"
    )
    assert result.name == "converted_output_2026-01-01T120000.docx"
    assert (tmp_path / "converted_output_2026-01-01T120000.docx").read_bytes() == b"docx-content"


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
