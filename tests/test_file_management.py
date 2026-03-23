# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for file management tools"""

import time
from typing import TYPE_CHECKING

import pytest

from app.tools import FileListResult, file_management
from app.tools.file_management import list_files

if TYPE_CHECKING:
    from pathlib import Path

    from app.config.settings import Settings


def test_list_files_workspace_does_not_exist(
    mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test list_files when workspace folder does not exist"""
    non_existent_folder = mock_settings.files_folder / "does_not_exist"
    mock_settings.files_folder = non_existent_folder

    monkeypatch.setattr(file_management, "settings", mock_settings)

    with pytest.raises(FileNotFoundError, match="Workspace folder does not exist"):
        list_files()


def test_list_files_no_pdfs_found(mock_settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test list_files when no PDF files exist"""
    monkeypatch.setattr(file_management, "settings", mock_settings)

    result = list_files(file_type="pdf")

    expected = FileListResult(
        files=[],
        total_count=0,
        file_type="pdf",
        folder_path=str(mock_settings.files_folder),
    )
    assert result == expected


def test_list_files_single_pdf(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test list_files with a single PDF file"""
    test_pdf = temp_workspace / "test_document.pdf"
    test_pdf.touch()

    monkeypatch.setattr(file_management, "settings", mock_settings)

    result = list_files(file_type="pdf")

    assert result.total_count == 1
    assert result.file_type == "pdf"
    assert len(result.files) == 1
    assert result.files[0].name == "test_document.pdf"
    assert result.files[0].size_mb >= 0  # Empty file has size


def test_list_files_multiple_pdfs_sorted_by_time(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test list_files with multiple PDFs sorted by modification time"""
    pdf1 = temp_workspace / "first.pdf"
    pdf1.touch()
    time.sleep(0.01)  # Ensure different timestamps

    pdf2 = temp_workspace / "second.pdf"
    pdf2.touch()
    time.sleep(0.01)

    pdf3 = temp_workspace / "third.pdf"
    pdf3.touch()

    monkeypatch.setattr(file_management, "settings", mock_settings)

    result = list_files(file_type="pdf")

    assert result.total_count == 3
    assert len(result.files) == 3

    # Verify files are sorted newest first
    file_names = [f.name for f in result.files]
    assert file_names == ["third.pdf", "second.pdf", "first.pdf"]

    # Verify timestamps are in descending order
    timestamps = [f.modified_time for f in result.files]
    assert timestamps == sorted(timestamps, reverse=True)


def test_list_files_all_file_types(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test list_files with file_type='all' includes non-PDF files"""
    (temp_workspace / "document.pdf").touch()
    (temp_workspace / "spreadsheet.xlsx").touch()
    (temp_workspace / "presentation.pptx").touch()
    (temp_workspace / "image.jpg").touch()
    (temp_workspace / "subfolder").mkdir()

    monkeypatch.setattr(file_management, "settings", mock_settings)

    result = list_files(file_type="all")

    assert result.total_count == 4
    assert result.file_type == "all"
    assert len(result.files) == 4

    file_names = {f.name for f in result.files}
    assert file_names == {"document.pdf", "spreadsheet.xlsx", "presentation.pptx", "image.jpg"}
    assert "subfolder" not in file_names  # Directories excluded


def test_list_files_pdf_only_excludes_other_types(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test that file_type='pdf' only lists PDF files"""
    (temp_workspace / "document.pdf").touch()
    (temp_workspace / "spreadsheet.xlsx").touch()
    (temp_workspace / "text.txt").touch()

    monkeypatch.setattr(file_management, "settings", mock_settings)

    result = list_files(file_type="pdf")

    assert result.total_count == 1
    assert len(result.files) == 1
    assert result.files[0].name == "document.pdf"


def test_list_files_case_insensitive_file_type(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test that file_type parameter is case-insensitive"""
    (temp_workspace / "test.pdf").touch()

    monkeypatch.setattr(file_management, "settings", mock_settings)

    result_lower = list_files(file_type="pdf")
    result_upper = list_files(file_type="PDF")

    # Both should find the same file
    assert result_lower.total_count == 1
    assert result_upper.total_count == 1
    assert result_lower.files[0].name == result_upper.files[0].name


def test_list_files_displays_file_size(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test that file sizes are calculated correctly in MB"""
    large_pdf = temp_workspace / "large.pdf"
    large_pdf.write_bytes(b"x" * (1024 * 1024))  # 1MB file

    monkeypatch.setattr(file_management, "settings", mock_settings)

    result = list_files(file_type="pdf")

    assert result.total_count == 1
    assert result.files[0].name == "large.pdf"
    # Allow small variance due to filesystem overhead
    assert 0.9 <= result.files[0].size_mb <= 1.1
