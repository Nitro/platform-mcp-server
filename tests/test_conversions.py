# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for conversion tools"""

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from freezegun import freeze_time
from mcp import ClientSession

from app.client import FileFormat
from app.handlers import PathTraversalError
from app.tools.conversions import ConversionRequest, ConversionResult


@pytest.mark.anyio
async def test_convert_file_invalid_format_raises(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Unknown target format returns an error response."""
    files_handler_mock.read.return_value = b"pdf-content"
    response = await client.call_tool(
        "convert_file",
        {
            "request": ConversionRequest(
                input_path=Path("a.pdf"), to="invalid-format"
            ).model_dump(),
        },
    )
    assert response.isError
    platform_handler_mock.convert_file.assert_not_called()


@pytest.mark.anyio
@freeze_time("2026-01-01T12:00:00+00:00")
async def test_convert_file_pdf_to_docx(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Convert PDF to DOCX calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.convert_file.return_value = b"converted-content"
    files_handler_mock.write_timestamped.return_value = Path("converted-a-2026-01-01T120000.docx")

    response = await client.call_tool(
        "convert_file",
        {"request": ConversionRequest(input_path=Path("a.pdf"), to="docx").model_dump()},
    )
    expected = ConversionResult(
        input_path="a.pdf",
        output_path="converted-a-2026-01-01T120000.docx",
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_called_once_with(Path("a.pdf"))
    platform_handler_mock.convert_file.assert_called_once_with(
        b"pdf-content",
        FileFormat.PDF,
        FileFormat.DOCX,
    )
    files_handler_mock.write_timestamped.assert_called_once_with(
        "converted", "a", "docx", b"converted-content"
    )


@pytest.mark.anyio
@freeze_time("2026-01-01T12:00:00+00:00")
async def test_convert_file_docx_to_pdf(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Convert DOCX to PDF calls handler with correct args."""
    files_handler_mock.read.return_value = b"docx-content"
    platform_handler_mock.convert_file.return_value = b"pdf-output"
    files_handler_mock.write_timestamped.return_value = Path("converted-doc-2026-01-01T120000.pdf")
    response = await client.call_tool(
        "convert_file",
        {"request": ConversionRequest(input_path=Path("doc.docx"), to="pdf").model_dump()},
    )
    expected = ConversionResult(
        input_path="doc.docx",
        output_path="converted-doc-2026-01-01T120000.pdf",
    ).model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.convert_file.assert_called_once_with(
        b"docx-content",
        FileFormat.DOCX,
        FileFormat.PDF,
    )


@pytest.mark.anyio
async def test_convert_file_path_traversal_raises(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Path traversal attempt returns an error response."""
    files_handler_mock.read.side_effect = PathTraversalError(Path("../../etc/passwd"))
    response = await client.call_tool(
        "convert_file",
        {
            "request": ConversionRequest(
                input_path=Path("../../etc/passwd"), to="docx"
            ).model_dump(),
        },
    )
    assert response.isError
    platform_handler_mock.convert_file.assert_not_called()


@pytest.mark.anyio
async def test_convert_file_missing_input_raises(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Missing input file returns an error response."""
    files_handler_mock.read.side_effect = FileNotFoundError
    response = await client.call_tool(
        "convert_file",
        {
            "request": ConversionRequest(input_path=Path("missing.pdf"), to="docx").model_dump(),
        },
    )
    assert response.isError
    platform_handler_mock.convert_file.assert_not_called()


@pytest.mark.anyio
async def test_convert_file_platform_error_raises(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Platform handler error returns an error response."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.convert_file.side_effect = RuntimeError("api-error")
    response = await client.call_tool(
        "convert_file",
        {"request": ConversionRequest(input_path=Path("a.pdf"), to="docx").model_dump()},
    )
    assert response.isError
    platform_handler_mock.convert_file.assert_called_once()


@pytest.mark.anyio
@freeze_time("2026-01-01T12:00:00+00:00")
async def test_convert_file_output_written_to_workspace(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Converted bytes are written via the files handler."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.convert_file.return_value = b"output-bytes"
    await client.call_tool(
        "convert_file",
        {"request": ConversionRequest(input_path=Path("a.pdf"), to="docx").model_dump()},
    )
    files_handler_mock.write_timestamped.assert_called_once_with(
        "converted", "a", "docx", b"output-bytes"
    )
