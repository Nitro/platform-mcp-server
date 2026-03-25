"""Tests for conversion tools"""

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from freezegun import freeze_time
from mcp import ClientSession

from app.client import FileFormat
from app.tools.conversions import ConversionRequest, ConversionResult


@pytest.mark.anyio
async def test_convert_file_invalid_format_raises(
    client: ClientSession,
    pdf_a: str,
    platform_handler_mock: MagicMock,
) -> None:
    """Unknown target format returns an error response."""
    response = await client.call_tool(
        "convert_file",
        {
            "request": ConversionRequest(input_path=Path(pdf_a), to="invalid-format").model_dump(),
        },
    )
    assert response.isError
    platform_handler_mock.convert_file.assert_not_called()


@pytest.mark.anyio
@freeze_time("2026-01-01T12:00:00+00:00")
async def test_convert_file_pdf_to_docx(
    client: ClientSession,
    pdf_a: str,
    platform_handler_mock: MagicMock,
    temp_workspace: Path,
) -> None:
    """Convert PDF to DOCX calls handler with correct args and returns result."""
    platform_handler_mock.convert_file.return_value = b"converted-content"
    response = await client.call_tool(
        "convert_file",
        {"request": ConversionRequest(input_path=Path(pdf_a), to="docx").model_dump()},
    )
    expected = ConversionResult(
        input_path=str(temp_workspace / pdf_a),
        output_path="converted-a-2026-01-01T120000.docx",
    ).model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.convert_file.assert_called_once_with(
        b"pdf-a-content",
        FileFormat.PDF,
        FileFormat.DOCX,
    )


@pytest.mark.anyio
@freeze_time("2026-01-01T12:00:00+00:00")
async def test_convert_file_docx_to_pdf(
    client: ClientSession,
    temp_workspace: Path,
    platform_handler_mock: MagicMock,
) -> None:
    """Convert DOCX to PDF calls handler with correct args."""
    (temp_workspace / "doc.docx").write_bytes(b"docx-content")
    platform_handler_mock.convert_file.return_value = b"pdf-output"
    response = await client.call_tool(
        "convert_file",
        {
            "request": ConversionRequest(input_path=Path("doc.docx"), to="pdf").model_dump(),
        },
    )
    expected = ConversionResult(
        input_path=str(temp_workspace / "doc.docx"),
        output_path="converted-doc-2026-01-01T120000.pdf",
    ).model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.convert_file.assert_called_once_with(
        b"docx-content",
        FileFormat.DOCX,
        FileFormat.PDF,
    )


@pytest.mark.anyio
async def test_convert_file_missing_input_raises(
    client: ClientSession,
    platform_handler_mock: MagicMock,
) -> None:
    """Missing input file returns an error response."""
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
    pdf_a: str,
    platform_handler_mock: MagicMock,
) -> None:
    """Platform handler error returns an error response."""
    platform_handler_mock.convert_file.side_effect = RuntimeError("api-error")
    response = await client.call_tool(
        "convert_file",
        {"request": ConversionRequest(input_path=Path(pdf_a), to="docx").model_dump()},
    )
    assert response.isError
    platform_handler_mock.convert_file.assert_called_once()


@pytest.mark.anyio
@freeze_time("2026-01-01T12:00:00+00:00")
async def test_convert_file_output_written_to_workspace(
    client: ClientSession,
    pdf_a: str,
    platform_handler_mock: MagicMock,
    temp_workspace: Path,
) -> None:
    """Converted bytes are written to the workspace folder."""
    platform_handler_mock.convert_file.return_value = b"output-bytes"
    response = await client.call_tool(
        "convert_file",
        {"request": ConversionRequest(input_path=Path(pdf_a), to="docx").model_dump()},
    )
    assert not response.isError
    output_file = temp_workspace / "converted-a-2026-01-01T120000.docx"
    assert output_file.exists()
    assert output_file.read_bytes() == b"output-bytes"
