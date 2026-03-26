# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for extraction tools"""

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from mcp import ClientSession

from app.tools.extractions import PDFMetadataRequest, PDFMetadataResult


@pytest.mark.anyio
async def test_get_pdf_metadata(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Get PDF metadata calls platform handler and returns result."""
    files_handler_mock.read.return_value = b"pdf-a-content"
    platform_handler_mock.get_pdf_metadata.return_value = b'{"title": "Test PDF"}'
    files_handler_mock.write.return_value = Path("a_metadata.json")

    response = await client.call_tool(
        "get_pdf_metadata",
        {"request": PDFMetadataRequest(input_filename=Path("a.pdf")).model_dump(mode="json")},
    )

    expected = PDFMetadataResult(
        input_filename="a.pdf",
        output_filename="a_metadata.json",
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_called_once_with(Path("a.pdf"))
    platform_handler_mock.get_pdf_metadata.assert_called_once_with(b"pdf-a-content")
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b'{"title": "Test PDF"}', stem_suffix="metadata", ext="json"
    )


@pytest.mark.anyio
async def test_get_pdf_metadata_empty(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Get PDF metadata with no metadata properties returns empty result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.get_pdf_metadata.return_value = b"{}"
    files_handler_mock.write.return_value = Path("empty_metadata.json")

    response = await client.call_tool(
        "get_pdf_metadata",
        {"request": PDFMetadataRequest(input_filename=Path("empty.pdf")).model_dump(mode="json")},
    )

    expected = PDFMetadataResult(
        input_filename="empty.pdf",
        output_filename="empty_metadata.json",
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_called_once_with(Path("empty.pdf"))
    platform_handler_mock.get_pdf_metadata.assert_called_once_with(b"pdf-content")
    files_handler_mock.write.assert_called_once_with(
        Path("empty.pdf"), b"{}", stem_suffix="metadata", ext="json"
    )
