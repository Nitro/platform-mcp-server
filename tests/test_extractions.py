# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for extraction tools"""

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from mcp import ClientSession

from app.handlers.platform_handler import ExtractionParams
from app.tools.extractions import (
    ExtractPDFDataRequest,
    ExtractPDFDataResult,
    PDFMetadataRequest,
    PDFMetadataResult,
)


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


@pytest.mark.anyio
async def test_extract_pdf_data_forms_json(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pdf_data for forms defaults to JSON output."""
    form_json = json.dumps({
        "fields": [{"name": "field-a", "value": "value-a", "confidence": 0.9}],
        "averageConfidence": 0.9,
    }).encode()
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = form_json
    files_handler_mock.write.return_value = Path("a-forms.json")

    response = await client.call_tool(
        "extract_pdf_data",
        {
            "request": ExtractPDFDataRequest(
                input_filename=Path("a.pdf"), data_type="forms", language="fr"
            ).model_dump(mode="json")
        },
    )

    expected = ExtractPDFDataResult(
        input_filename="a.pdf",
        output_filename="a-forms.json",
        data_type="forms",
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_called_once_with(Path("a.pdf"))
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "forms", ExtractionParams(language="fr")
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), form_json, stem_suffix="forms", ext="json"
    )


@pytest.mark.anyio
async def test_extract_pdf_data_forms_excel(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pdf_data for forms with excel output writes Excel file."""
    form_json = json.dumps({
        "fields": [{"name": "field-a", "value": "value-a", "confidence": 0.9}],
        "averageConfidence": 0.9,
    }).encode()
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = form_json
    files_handler_mock.write.return_value = Path("a-forms.xlsx")

    response = await client.call_tool(
        "extract_pdf_data",
        {
            "request": ExtractPDFDataRequest(
                input_filename=Path("a.pdf"),
                data_type="forms",
                language="fr",
                output_format="excel",
            ).model_dump(mode="json")
        },
    )

    expected = ExtractPDFDataResult(
        input_filename="a.pdf",
        output_filename="a-forms.xlsx",
        data_type="forms",
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.write.assert_called_once()
    write_call = files_handler_mock.write.call_args
    assert write_call.args[0] == Path("a.pdf")
    assert write_call.kwargs == {"stem_suffix": "forms", "ext": "xlsx"}


@pytest.mark.anyio
async def test_extract_pdf_data_tables_json(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pdf_data for tables defaults to JSON output."""
    tables_json = json.dumps({
        "tables": [
            {
                "tableData": {
                    "title": "table-a",
                    "cells": [["a", "b"]],
                    "averageConfidence": 0.8,
                },
                "pageIndices": [0],
            }
        ]
    }).encode()
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = tables_json
    files_handler_mock.write.return_value = Path("a-tables.json")

    response = await client.call_tool(
        "extract_pdf_data",
        {
            "request": ExtractPDFDataRequest(
                input_filename=Path("a.pdf"), data_type="tables", page_indices=[0, 1]
            ).model_dump(mode="json")
        },
    )

    expected = ExtractPDFDataResult(
        input_filename="a.pdf",
        output_filename="a-tables.json",
        data_type="tables",
    ).model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "tables", ExtractionParams(pageIndices=[0, 1])
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), tables_json, stem_suffix="tables", ext="json"
    )


@pytest.mark.anyio
async def test_extract_pdf_data_tables_excel(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pdf_data for tables with excel output writes Excel file."""
    tables_json = json.dumps({
        "tables": [
            {
                "tableData": {
                    "title": "table-a",
                    "cells": [["a", "b"]],
                    "averageConfidence": 0.8,
                },
                "pageIndices": [0],
            }
        ]
    }).encode()
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = tables_json
    files_handler_mock.write.return_value = Path("a-tables.xlsx")

    response = await client.call_tool(
        "extract_pdf_data",
        {
            "request": ExtractPDFDataRequest(
                input_filename=Path("a.pdf"),
                data_type="tables",
                page_indices=[0, 1],
                output_format="excel",
            ).model_dump(mode="json")
        },
    )

    expected = ExtractPDFDataResult(
        input_filename="a.pdf",
        output_filename="a-tables.xlsx",
        data_type="tables",
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.write.assert_called_once()
    write_call = files_handler_mock.write.call_args
    assert write_call.args[0] == Path("a.pdf")
    assert write_call.kwargs == {"stem_suffix": "tables", "ext": "xlsx"}


@pytest.mark.anyio
async def test_extract_pdf_data_text(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pdf_data for text writes JSON output."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = b'{"text": ""}'
    files_handler_mock.write.return_value = Path("a-text.json")

    response = await client.call_tool(
        "extract_pdf_data",
        {
            "request": ExtractPDFDataRequest(
                input_filename=Path("a.pdf"),
                data_type="text",
                page_indices=[0],
                reading_order=True,
            ).model_dump(mode="json")
        },
    )

    expected = ExtractPDFDataResult(
        input_filename="a.pdf", output_filename="a-text.json", data_type="text"
    ).model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "text", ExtractionParams(pageIndices=[0], readingOrder=True)
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b'{"text": ""}', stem_suffix="text", ext="json"
    )


@pytest.mark.anyio
async def test_extract_pdf_data_accessibility(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pdf_data for accessibility writes JSON output."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = b'{"accessibility": {}}'
    files_handler_mock.write.return_value = Path("a-accessibility.json")

    response = await client.call_tool(
        "extract_pdf_data",
        {
            "request": ExtractPDFDataRequest(
                input_filename=Path("a.pdf"), data_type="accessibility"
            ).model_dump(mode="json")
        },
    )

    expected = ExtractPDFDataResult(
        input_filename="a.pdf",
        output_filename="a-accessibility.json",
        data_type="accessibility",
    ).model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "accessibility", ExtractionParams()
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b'{"accessibility": {}}', stem_suffix="accessibility", ext="json"
    )


@pytest.mark.anyio
async def test_extract_pdf_data_excel_unsupported_data_type(
    client: ClientSession,
    files_handler_mock: MagicMock,
) -> None:
    """Excel output format raises error for text data type."""
    files_handler_mock.read.return_value = b"pdf-content"

    response = await client.call_tool(
        "extract_pdf_data",
        {
            "request": ExtractPDFDataRequest(
                input_filename=Path("a.pdf"), data_type="text", output_format="excel"
            ).model_dump(mode="json")
        },
    )

    assert response.isError is True
