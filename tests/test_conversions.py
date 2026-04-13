# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for conversion tools"""

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.client import FileFormat
from app.handlers import PathTraversalError
from app.tools.conversions import ConversionRequest, ConversionResult
from tests.tool_caller import ToolCaller


@pytest.mark.anyio
async def test_convert_file_invalid_format_raises(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Unknown target format returns an error response."""
    files_handler_mock.read.return_value = b"pdf-content"
    await tool_caller.call(
        "convert_file",
        ConversionRequest(input_filename=Path("a.pdf"), to="invalid-format"),
        expect_error=True,
    )
    platform_handler_mock.convert_file.assert_not_called()


@pytest.mark.anyio
async def test_convert_file_pdf_to_docx(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Convert PDF to DOCX calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.convert_file.return_value = b"converted-content"
    files_handler_mock.write.return_value = Path("a-converted.docx")

    await tool_caller.call(
        "convert_file",
        ConversionRequest(input_filename=Path("a.pdf"), to="docx"),
        expected_result=ConversionResult(output_filename="a-converted.docx"),
    )
    files_handler_mock.read.assert_called_once_with(Path("a.pdf"))
    platform_handler_mock.convert_file.assert_called_once_with(
        b"pdf-content",
        FileFormat.PDF,
        FileFormat.DOCX,
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b"converted-content", stem_suffix="converted", ext="docx"
    )


@pytest.mark.anyio
async def test_convert_file_docx_to_pdf(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Convert DOCX to PDF calls handler with correct args."""
    files_handler_mock.read.return_value = b"docx-content"
    platform_handler_mock.convert_file.return_value = b"pdf-output"
    files_handler_mock.write.return_value = Path("doc-converted.pdf")
    await tool_caller.call(
        "convert_file",
        ConversionRequest(input_filename=Path("doc.docx"), to="pdf"),
        expected_result=ConversionResult(output_filename="doc-converted.pdf"),
    )
    files_handler_mock.read.assert_called_once_with(Path("doc.docx"))
    platform_handler_mock.convert_file.assert_called_once_with(
        b"docx-content",
        FileFormat.DOCX,
        FileFormat.PDF,
    )
    files_handler_mock.write.assert_called_once_with(
        Path("doc.docx"), b"pdf-output", stem_suffix="converted", ext="pdf"
    )


@pytest.mark.anyio
async def test_convert_file_path_traversal_raises(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Path traversal attempt returns an error response."""
    files_handler_mock.read.side_effect = PathTraversalError(Path("../../etc/passwd"))
    await tool_caller.call(
        "convert_file",
        ConversionRequest(input_filename=Path("../../etc/passwd"), to="docx"),
        expect_error=True,
    )
    platform_handler_mock.convert_file.assert_not_called()


@pytest.mark.anyio
async def test_convert_file_missing_input_raises(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Missing input file returns an error response."""
    files_handler_mock.read.side_effect = FileNotFoundError
    await tool_caller.call(
        "convert_file",
        ConversionRequest(input_filename=Path("missing.pdf"), to="docx"),
        expect_error=True,
    )
    platform_handler_mock.convert_file.assert_not_called()


@pytest.mark.anyio
async def test_convert_file_platform_error_raises(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Platform handler error returns an error response."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.convert_file.side_effect = RuntimeError("api-error")
    await tool_caller.call(
        "convert_file",
        ConversionRequest(input_filename=Path("a.pdf"), to="docx"),
        expect_error=True,
    )
    platform_handler_mock.convert_file.assert_called_once()
    files_handler_mock.write.assert_not_called()


@pytest.mark.anyio
async def test_convert_file_output_written_to_workspace(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Converted bytes are written via the files handler."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.convert_file.return_value = b"output-bytes"
    await tool_caller.call(
        "convert_file", ConversionRequest(input_filename=Path("a.pdf"), to="docx")
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b"output-bytes", stem_suffix="converted", ext="docx"
    )


@pytest.mark.anyio
async def test_convert_file_pdf_to_jpeg_writes_zip(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """PDF to JPEG conversion writes ZIP file (API returns one image per page in a ZIP)."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.convert_file.return_value = b"zip-with-images"
    files_handler_mock.write.return_value = Path("a-converted.zip")

    await tool_caller.call(
        "convert_file",
        ConversionRequest(input_filename=Path("a.pdf"), to="jpeg"),
        expected_result=ConversionResult(output_filename="a-converted.zip"),
    )
    files_handler_mock.read.assert_called_once_with(Path("a.pdf"))
    platform_handler_mock.convert_file.assert_called_once_with(
        b"pdf-content",
        FileFormat.PDF,
        FileFormat.JPEG,
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b"zip-with-images", stem_suffix="converted", ext="zip"
    )


@pytest.mark.anyio
async def test_convert_file_pdf_to_png_writes_zip(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """PDF to PNG conversion writes ZIP file (API returns one image per page in a ZIP)."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.convert_file.return_value = b"zip-with-images"
    files_handler_mock.write.return_value = Path("doc-converted.zip")

    await tool_caller.call(
        "convert_file",
        ConversionRequest(input_filename=Path("doc.pdf"), to="png"),
        expected_result=ConversionResult(output_filename="doc-converted.zip"),
    )
    files_handler_mock.read.assert_called_once_with(Path("doc.pdf"))
    platform_handler_mock.convert_file.assert_called_once_with(
        b"pdf-content",
        FileFormat.PDF,
        FileFormat.PNG,
    )
    files_handler_mock.write.assert_called_once_with(
        Path("doc.pdf"), b"zip-with-images", stem_suffix="converted", ext="zip"
    )
