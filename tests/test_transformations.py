# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for transformation tools"""

from typing import TYPE_CHECKING
from unittest.mock import Mock, patch

import pytest
from pydantic import ValidationError

from app.tools import MergeResult, transformations
from app.tools.transformations import MergeRequest, merge_files

if TYPE_CHECKING:
    from pathlib import Path

    from app.config.settings import Settings


def test_merge_files_success(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test successful merge of multiple PDF files"""
    # Create test PDF files
    pdf1 = temp_workspace / "file1.pdf"
    pdf1.write_bytes(b"pdf1")
    pdf2 = temp_workspace / "file2.pdf"
    pdf2.write_bytes(b"pdf2")

    monkeypatch.setattr(transformations, "settings", mock_settings)

    # Mock PlatformHandler
    mock_client = Mock()
    mock_client.merge_pdfs.return_value = b"merged-pdf-content"

    with patch("app.tools.transformations.PlatformHandler.create", return_value=mock_client):
        request = MergeRequest(
            input_paths=[pdf1, pdf2],
            output_path=temp_workspace / "output.pdf",
        )
        result = merge_files(request)

    # Verify result
    assert isinstance(result, MergeResult)
    assert result.output_filename == "output.pdf"
    assert result.input_files == ["file1.pdf", "file2.pdf"]
    assert result.input_count == 2
    assert result.total_input_size_bytes == 8  # 4 bytes each
    assert result.output_size_bytes == 18

    # Verify output file was created
    output_file = temp_workspace / "output.pdf"
    assert output_file.exists()
    assert output_file.read_bytes() == b"merged-pdf-content"


def test_merge_files_without_pdf_extension(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test merge with output path without .pdf extension"""
    pdf1 = temp_workspace / "file1.pdf"
    pdf1.write_bytes(b"pdf1")
    pdf2 = temp_workspace / "file2.pdf"
    pdf2.write_bytes(b"pdf2")

    monkeypatch.setattr(transformations, "settings", mock_settings)

    mock_client = Mock()
    mock_client.merge_pdfs.return_value = b"merged"

    with patch("app.tools.transformations.PlatformHandler.create", return_value=mock_client):
        request = MergeRequest(
            input_paths=[pdf1, pdf2],
            output_path=temp_workspace / "output",
        )
        result = merge_files(request)

    # Verify filename is used as-is
    assert result.output_filename == "output"
    output_file = temp_workspace / "output"
    assert output_file.exists()


def test_merge_files_empty_list(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test merge with empty input list raises validation error"""
    monkeypatch.setattr(transformations, "settings", mock_settings)

    with pytest.raises(ValidationError):
        MergeRequest(
            input_paths=[],
            output_path=temp_workspace / "output.pdf",
        )


def test_merge_files_single_file(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test merge with single file raises validation error"""
    monkeypatch.setattr(transformations, "settings", mock_settings)

    pdf1 = temp_workspace / "file1.pdf"
    pdf1.write_bytes(b"pdf1")

    with pytest.raises(ValidationError):
        MergeRequest(
            input_paths=[pdf1],
            output_path=temp_workspace / "output.pdf",
        )


def test_merge_files_file_not_found(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test merge with non-existent file raises FileNotFoundError"""
    pdf1 = temp_workspace / "file1.pdf"
    pdf1.write_bytes(b"pdf1")
    missing_file = temp_workspace / "missing.pdf"

    monkeypatch.setattr(transformations, "settings", mock_settings)

    request = MergeRequest(
        input_paths=[pdf1, missing_file],
        output_path=temp_workspace / "output.pdf",
    )
    with pytest.raises(FileNotFoundError, match="File not found"):
        merge_files(request)


def test_merge_files_multiple_files(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test merge with multiple PDF files"""
    # Create test files
    pdf1 = temp_workspace / "doc1.pdf"
    pdf1.write_bytes(b"a" * 100)
    pdf2 = temp_workspace / "doc2.pdf"
    pdf2.write_bytes(b"b" * 200)
    pdf3 = temp_workspace / "doc3.pdf"
    pdf3.write_bytes(b"c" * 300)

    monkeypatch.setattr(transformations, "settings", mock_settings)

    mock_client = Mock()
    mock_client.merge_pdfs.return_value = b"merged-result"

    with patch("app.tools.transformations.PlatformHandler.create", return_value=mock_client):
        request = MergeRequest(
            input_paths=[pdf1, pdf2, pdf3],
            output_path=temp_workspace / "combined.pdf",
        )
        result = merge_files(request)

    assert result.input_count == 3
    assert result.total_input_size_bytes == 600  # 100 + 200 + 300
    assert result.output_size_bytes == 13
    assert result.input_files == ["doc1.pdf", "doc2.pdf", "doc3.pdf"]


def test_merge_files_client_error(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test merge handles client errors properly"""
    pdf1 = temp_workspace / "file1.pdf"
    pdf1.write_bytes(b"pdf1")
    pdf2 = temp_workspace / "file2.pdf"
    pdf2.write_bytes(b"pdf2")

    monkeypatch.setattr(transformations, "settings", mock_settings)

    mock_client = Mock()
    mock_client.merge_pdfs.side_effect = RuntimeError("API error")

    request = MergeRequest(
        input_paths=[pdf1, pdf2],
        output_path=temp_workspace / "output.pdf",
    )
    with (
        patch("app.tools.transformations.PlatformHandler.create", return_value=mock_client),
        pytest.raises(RuntimeError, match="API error"),
    ):
        merge_files(request)


def test_merge_files_custom_output_name(
    temp_workspace: Path, mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test merge with custom output name"""
    pdf1 = temp_workspace / "file1.pdf"
    pdf1.write_bytes(b"pdf1")
    pdf2 = temp_workspace / "file2.pdf"
    pdf2.write_bytes(b"pdf2")

    monkeypatch.setattr(transformations, "settings", mock_settings)

    mock_client = Mock()
    mock_client.merge_pdfs.return_value = b"merged"

    with patch("app.tools.transformations.PlatformHandler.create", return_value=mock_client):
        request = MergeRequest(
            input_paths=[pdf1, pdf2],
            output_path=temp_workspace / "custom_name.pdf",
        )
        result = merge_files(request)

    assert result.output_filename == "custom_name.pdf"
    output_file = temp_workspace / "custom_name.pdf"
    assert output_file.exists()
