# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for extraction tools"""

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from mcp import ClientSession

from app.handlers.platform_handler import ExtractionParams
from app.tools.extractions import (
    ExtractPDFAccessibilityRequest,
    ExtractPDFDataResult,
    ExtractPDFFormsRequest,
    ExtractPDFTablesRequest,
    ExtractPDFTextRequest,
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

    expected = PDFMetadataResult(output_filename="a_metadata.json").model_dump()
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

    expected = PDFMetadataResult(output_filename="empty_metadata.json").model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_called_once_with(Path("empty.pdf"))
    platform_handler_mock.get_pdf_metadata.assert_called_once_with(b"pdf-content")
    files_handler_mock.write.assert_called_once_with(
        Path("empty.pdf"), b"{}", stem_suffix="metadata", ext="json"
    )


@pytest.mark.anyio
async def test_extract_pdf_forms_excel(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pdf_forms defaults to Excel output."""
    form_json = json.dumps({
        "fields": [{"name": "field-a", "value": "value-a", "confidence": 0.9}],
        "averageConfidence": 0.9,
    }).encode()
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = form_json
    files_handler_mock.write.return_value = Path("a-forms.xlsx")

    response = await client.call_tool(
        "extract_pdf_forms",
        {
            "request": ExtractPDFFormsRequest(
                input_filename=Path("a.pdf"), language="fr"
            ).model_dump(mode="json")
        },
    )

    expected = ExtractPDFDataResult(output_filename="a-forms.xlsx", data_type="forms").model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "forms", ExtractionParams(language="fr")
    )
    files_handler_mock.write.assert_called_once()
    write_call = files_handler_mock.write.call_args
    assert write_call.args[0] == Path("a.pdf")
    assert write_call.kwargs == {"stem_suffix": "forms", "ext": "xlsx"}


@pytest.mark.anyio
async def test_extract_pdf_forms_json(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pdf_forms with json output writes JSON file."""
    form_json = json.dumps({
        "fields": [{"name": "field-a", "value": "value-a", "confidence": 0.9}],
        "averageConfidence": 0.9,
    }).encode()
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = form_json
    files_handler_mock.write.return_value = Path("a-forms.json")

    response = await client.call_tool(
        "extract_pdf_forms",
        {
            "request": ExtractPDFFormsRequest(
                input_filename=Path("a.pdf"), language="fr", output_format="json"
            ).model_dump(mode="json")
        },
    )

    expected = ExtractPDFDataResult(output_filename="a-forms.json", data_type="forms").model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "forms", ExtractionParams(language="fr")
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), form_json, stem_suffix="forms", ext="json"
    )


@pytest.mark.anyio
async def test_extract_pdf_tables_excel(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pdf_tables defaults to Excel output."""
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
        "extract_pdf_tables",
        {
            "request": ExtractPDFTablesRequest(
                input_filename=Path("a.pdf"), page_indices=[0, 1]
            ).model_dump(mode="json")
        },
    )

    expected = ExtractPDFDataResult(
        output_filename="a-tables.xlsx", data_type="tables"
    ).model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "tables", ExtractionParams(pageIndices=[0, 1])
    )
    files_handler_mock.write.assert_called_once()
    write_call = files_handler_mock.write.call_args
    assert write_call.args[0] == Path("a.pdf")
    assert write_call.kwargs == {"stem_suffix": "tables", "ext": "xlsx"}


@pytest.mark.anyio
async def test_extract_pdf_tables_json(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pdf_tables with json output writes JSON file."""
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
        "extract_pdf_tables",
        {
            "request": ExtractPDFTablesRequest(
                input_filename=Path("a.pdf"), page_indices=[0, 1], output_format="json"
            ).model_dump(mode="json")
        },
    )

    expected = ExtractPDFDataResult(
        output_filename="a-tables.json", data_type="tables"
    ).model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "tables", ExtractionParams(pageIndices=[0, 1])
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), tables_json, stem_suffix="tables", ext="json"
    )


@pytest.mark.anyio
async def test_extract_pdf_text(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pdf_text writes JSON output."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = b'{"text": ""}'
    files_handler_mock.write.return_value = Path("a-text.json")

    response = await client.call_tool(
        "extract_pdf_text",
        {
            "request": ExtractPDFTextRequest(
                input_filename=Path("a.pdf"),
                page_indices=[0],
                reading_order=True,
            ).model_dump(mode="json")
        },
    )

    expected = ExtractPDFDataResult(output_filename="a-text.json", data_type="text").model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "text", ExtractionParams(pageIndices=[0], readingOrder=True)
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b'{"text": ""}', stem_suffix="text", ext="json"
    )


@pytest.mark.anyio
async def test_extract_pdf_accessibility(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pdf_accessibility writes JSON output."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = b'{"accessibility": {}}'
    files_handler_mock.write.return_value = Path("a-accessibility.json")

    response = await client.call_tool(
        "extract_pdf_accessibility",
        {
            "request": ExtractPDFAccessibilityRequest(input_filename=Path("a.pdf")).model_dump(
                mode="json"
            )
        },
    )

    expected = ExtractPDFDataResult(
        output_filename="a-accessibility.json", data_type="accessibility"
    ).model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "accessibility", ExtractionParams()
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b'{"accessibility": {}}', stem_suffix="accessibility", ext="json"
    )
