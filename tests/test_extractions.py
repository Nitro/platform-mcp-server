# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for extraction tools"""

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.handlers.platform_handler import ExtractionParams
from app.tools.extractions import (
    ExtractPDFAccessibilityRequest,
    ExtractPDFDataResult,
    ExtractPDFFormsRequest,
    ExtractPDFTablesRequest,
    ExtractPDFTextRequest,
    ExtractPDFTextResult,
    PDFMetadataRequest,
    PDFMetadataResult,
    SearchTextInPDFRequest,
    SearchTextInPDFResult,
)
from tests.tool_caller import ToolCaller


@pytest.mark.anyio
async def test_get_pdf_metadata(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Get PDF metadata calls platform handler and returns result."""
    files_handler_mock.read.return_value = b"pdf-a-content"
    platform_handler_mock.get_pdf_metadata.return_value = b'{"title": "Test PDF"}'
    files_handler_mock.write.return_value = tmp_path / "a_metadata.json"

    await tool_caller.call(
        "get_pdf_metadata",
        PDFMetadataRequest(input_path=tmp_path / "a.pdf"),
        expected_result=PDFMetadataResult(output_filename="a_metadata.json"),
    )
    files_handler_mock.read.assert_called_once_with(tmp_path / "a.pdf")
    platform_handler_mock.get_pdf_metadata.assert_called_once_with(b"pdf-a-content")
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", b'{"title": "Test PDF"}', stem_suffix="metadata", ext="json"
    )


@pytest.mark.anyio
async def test_get_pdf_metadata_empty(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Get PDF metadata with no metadata properties returns empty result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.get_pdf_metadata.return_value = b"{}"
    files_handler_mock.write.return_value = tmp_path / "empty_metadata.json"

    await tool_caller.call(
        "get_pdf_metadata",
        PDFMetadataRequest(input_path=tmp_path / "empty.pdf"),
        expected_result=PDFMetadataResult(output_filename="empty_metadata.json"),
    )
    files_handler_mock.read.assert_called_once_with(tmp_path / "empty.pdf")
    platform_handler_mock.get_pdf_metadata.assert_called_once_with(b"pdf-content")
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "empty.pdf", b"{}", stem_suffix="metadata", ext="json"
    )


@pytest.mark.anyio
async def test_extract_pdf_forms_excel(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """extract_pdf_forms defaults to Excel output."""
    form_json = json.dumps({
        "fields": [{"name": "field-a", "value": "value-a", "confidence": 0.9}],
        "averageConfidence": 0.9,
    }).encode()
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = form_json
    files_handler_mock.write.return_value = tmp_path / "a-forms.xlsx"

    await tool_caller.call(
        "extract_pdf_forms",
        ExtractPDFFormsRequest(input_path=tmp_path / "a.pdf", language="fr"),
        expected_result=ExtractPDFDataResult(output_filename="a-forms.xlsx", data_type="forms"),
    )
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "forms", ExtractionParams(language="fr")
    )
    files_handler_mock.write.assert_called_once()
    write_call = files_handler_mock.write.call_args
    assert write_call.args[0] == tmp_path / "a.pdf"
    assert write_call.kwargs == {"stem_suffix": "forms", "ext": "xlsx"}


@pytest.mark.anyio
async def test_extract_pdf_forms_json(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """extract_pdf_forms with json output writes JSON file."""
    form_json = json.dumps({
        "fields": [{"name": "field-a", "value": "value-a", "confidence": 0.9}],
        "averageConfidence": 0.9,
    }).encode()
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = form_json
    files_handler_mock.write.return_value = tmp_path / "a-forms.json"

    await tool_caller.call(
        "extract_pdf_forms",
        ExtractPDFFormsRequest(input_path=tmp_path / "a.pdf", language="fr", output_format="json"),
        expected_result=ExtractPDFDataResult(output_filename="a-forms.json", data_type="forms"),
    )
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "forms", ExtractionParams(language="fr")
    )
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", form_json, stem_suffix="forms", ext="json"
    )


@pytest.mark.anyio
async def test_extract_pdf_tables_excel(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
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
    files_handler_mock.write.return_value = tmp_path / "a-tables.xlsx"

    await tool_caller.call(
        "extract_pdf_tables",
        ExtractPDFTablesRequest(input_path=tmp_path / "a.pdf", page_indices=[0, 1]),
        expected_result=ExtractPDFDataResult(output_filename="a-tables.xlsx", data_type="tables"),
    )
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "tables", ExtractionParams(pageIndices=[0, 1])
    )
    files_handler_mock.write.assert_called_once()
    write_call = files_handler_mock.write.call_args
    assert write_call.args[0] == tmp_path / "a.pdf"
    assert write_call.kwargs == {"stem_suffix": "tables", "ext": "xlsx"}


@pytest.mark.anyio
async def test_extract_pdf_tables_json(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
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
    files_handler_mock.write.return_value = tmp_path / "a-tables.json"

    await tool_caller.call(
        "extract_pdf_tables",
        ExtractPDFTablesRequest(
            input_path=tmp_path / "a.pdf", page_indices=[0, 1], output_format="json"
        ),
        expected_result=ExtractPDFDataResult(output_filename="a-tables.json", data_type="tables"),
    )
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "tables", ExtractionParams(pageIndices=[0, 1])
    )
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", tables_json, stem_suffix="tables", ext="json"
    )


@pytest.mark.anyio
async def test_extract_pdf_text(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """extract_pdf_text writes text output with statistics."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = b'"text-a text-b"'
    files_handler_mock.write.return_value = tmp_path / "a-text.txt"

    await tool_caller.call(
        "extract_pdf_text",
        ExtractPDFTextRequest(
            input_path=tmp_path / "a.pdf",
            page_indices=[0],
            reading_order=True,
        ),
        expected_result=ExtractPDFTextResult(
            output_filename="a-text.txt",
            word_count=2,
            character_count=13,
        ),
    )
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "text", ExtractionParams(pageIndices=[0], readingOrder=True)
    )
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", b"text-a text-b", stem_suffix="text", ext="txt"
    )


@pytest.mark.anyio
async def test_extract_pdf_text_all_pages(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """extract_pdf_text with no page_indices extracts all pages."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = b'"text"'
    files_handler_mock.write.return_value = tmp_path / "a-text.txt"

    await tool_caller.call(
        "extract_pdf_text",
        ExtractPDFTextRequest(input_path=tmp_path / "a.pdf"),
        expected_result=ExtractPDFTextResult(
            output_filename="a-text.txt",
            word_count=1,
            character_count=4,
        ),
    )
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "text", ExtractionParams(readingOrder=False)
    )


@pytest.mark.skip(reason="tool not yet released")
@pytest.mark.anyio
async def test_extract_pdf_accessibility(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """extract_pdf_accessibility writes JSON output."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pdf_data.return_value = b'{"accessibility": {}}'
    files_handler_mock.write.return_value = tmp_path / "a-accessibility.json"

    await tool_caller.call(
        "extract_pdf_accessibility",
        ExtractPDFAccessibilityRequest(input_path=tmp_path / "a.pdf"),
        expected_result=ExtractPDFDataResult(
            output_filename="a-accessibility.json", data_type="accessibility"
        ),
    )
    platform_handler_mock.extract_pdf_data.assert_called_once_with(
        b"pdf-content", "accessibility", ExtractionParams()
    )
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", b'{"accessibility": {}}', stem_suffix="accessibility", ext="json"
    )


@pytest.mark.anyio
async def test_search_text_in_pdf(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """search_text_in_pdf calls platform handler and returns result with summary."""
    text_boxes_json = json.dumps({
        "textBoxes": [
            {
                "text": "text-1",
                "pageIndex": 0,
                "boundingBox": [0.0, 0.0, 0.0, 0.0],
            },
            {
                "text": "text-2",
                "pageIndex": 0,
                "boundingBox": [0.0, 0.0, 0.0, 0.0],
            },
            {
                "text": "text-1",
                "pageIndex": 0,
                "boundingBox": [0.0, 0.0, 0.0, 0.0],
            },
        ]
    }).encode()

    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_text_bounding_boxes.return_value = text_boxes_json
    files_handler_mock.write.return_value = tmp_path / "a-search.json"

    await tool_caller.call(
        "search_text_in_pdf",
        SearchTextInPDFRequest(input_path=tmp_path / "a.pdf", texts=["text-1", "text-2"]),
        expected_result=SearchTextInPDFResult(
            output_filename="a-search.json",
            total_matches=3,
            unique_texts_found=2,
        ),
    )

    files_handler_mock.read.assert_called_once_with(tmp_path / "a.pdf")
    platform_handler_mock.extract_text_bounding_boxes.assert_called_once_with(
        b"pdf-content", ["text-1", "text-2"]
    )
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", text_boxes_json, stem_suffix="search", ext="json"
    )
