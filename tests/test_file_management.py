# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for file management tools"""

import time
from typing import TYPE_CHECKING

from platform_mcp_server.tools import file_management
from platform_mcp_server.tools.file_management import list_files

if TYPE_CHECKING:
    from pathlib import Path

    import pytest

    from platform_mcp_server.config.settings import Settings


def test_list_files_workspace_does_not_exist(
    mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test list_files when workspace folder does not exist"""
    # Create settings with non-existent folder
    non_existent_folder = mock_settings.files_folder / "does_not_exist"
    mock_settings.files_folder = non_existent_folder

    monkeypatch.setattr(file_management, "settings", mock_settings)

    result = list_files()

    assert "❌ Workspace folder does not exist" in result
    assert str(non_existent_folder) in result


def test_list_files_no_pdfs_found(mock_settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test list_files when no PDF files exist"""
    monkeypatch.setattr(file_management, "settings", mock_settings)

    result = list_files(file_type="pdf")

    assert "No PDF files found" in result
    assert str(mock_settings.files_folder) in result


def test_list_files_single_pdf(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test list_files with a single PDF file"""
    # Create a test PDF file
    test_pdf = temp_workspace / "test_document.pdf"
    test_pdf.write_bytes(b"%PDF-1.4\ntest content")

    monkeypatch.setattr(file_management, "settings", mock_settings)

    result = list_files(file_type="pdf")

    assert "Found 1 PDF file(s)" in result
    assert "test_document.pdf" in result
    assert "MB" in result  # Size should be displayed


def test_list_files_multiple_pdfs_sorted_by_time(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test list_files with multiple PDFs sorted by modification time"""
    # Create multiple PDF files with different timestamps
    pdf1 = temp_workspace / "first.pdf"
    pdf1.write_bytes(b"%PDF-1.4\nfirst")
    time.sleep(0.01)  # Ensure different timestamps

    pdf2 = temp_workspace / "second.pdf"
    pdf2.write_bytes(b"%PDF-1.4\nsecond")
    time.sleep(0.01)

    pdf3 = temp_workspace / "third.pdf"
    pdf3.write_bytes(b"%PDF-1.4\nthird")

    monkeypatch.setattr(file_management, "settings", mock_settings)

    result = list_files(file_type="pdf")

    assert "Found 3 PDF file(s)" in result
    assert "first.pdf" in result
    assert "second.pdf" in result
    assert "third.pdf" in result

    # Verify newest first (third.pdf should appear before first.pdf)
    third_index = result.index("third.pdf")
    first_index = result.index("first.pdf")
    assert third_index < first_index


def test_list_files_all_file_types(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test list_files with file_type='all' includes non-PDF files"""
    # Create various file types
    (temp_workspace / "document.pdf").write_bytes(b"%PDF-1.4\ntest")
    (temp_workspace / "spreadsheet.xlsx").write_bytes(b"excel content")
    (temp_workspace / "presentation.pptx").write_bytes(b"pptx content")
    (temp_workspace / "image.jpg").write_bytes(b"jpeg content")

    # Create a subdirectory (should be excluded)
    (temp_workspace / "subfolder").mkdir()

    monkeypatch.setattr(file_management, "settings", mock_settings)

    result = list_files(file_type="all")

    assert "Found 4 ALL file(s)" in result
    assert "document.pdf" in result
    assert "spreadsheet.xlsx" in result
    assert "presentation.pptx" in result
    assert "image.jpg" in result
    assert "subfolder" not in result  # Directories should not be listed


def test_list_files_pdf_only_excludes_other_types(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test that file_type='pdf' only lists PDF files"""
    # Create PDF and non-PDF files
    (temp_workspace / "document.pdf").write_bytes(b"%PDF-1.4\ntest")
    (temp_workspace / "spreadsheet.xlsx").write_bytes(b"excel content")
    (temp_workspace / "text.txt").write_bytes(b"text content")

    monkeypatch.setattr(file_management, "settings", mock_settings)

    result = list_files(file_type="pdf")

    assert "Found 1 PDF file(s)" in result
    assert "document.pdf" in result
    assert "spreadsheet.xlsx" not in result
    assert "text.txt" not in result


def test_list_files_case_insensitive_file_type(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test that file_type parameter is case-insensitive"""
    (temp_workspace / "test.pdf").write_bytes(b"%PDF-1.4\ntest")

    monkeypatch.setattr(file_management, "settings", mock_settings)

    result_lower = list_files(file_type="pdf")
    result_upper = list_files(file_type="PDF")

    # Both should find the PDF
    assert "Found 1 PDF file(s)" in result_lower
    assert "Found 1 PDF file(s)" in result_upper


def test_list_files_displays_file_size(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test that file sizes are displayed in MB"""
    # Create a file with known size (1MB = 1024*1024 bytes)
    large_pdf = temp_workspace / "large.pdf"
    large_pdf.write_bytes(b"%PDF-1.4\n" + b"x" * (1024 * 1024))

    monkeypatch.setattr(file_management, "settings", mock_settings)

    result = list_files(file_type="pdf")

    assert "large.pdf" in result
    assert "1.0 MB" in result or "1.1 MB" in result  # Allow small variance
