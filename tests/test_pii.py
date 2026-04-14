# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for PII detection and redaction tools"""

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.tools.pii import (
    ExtractPIIRequest,
    ExtractPIIResult,
    RedactionArea,
    RedactPDFRequest,
    RedactPDFResult,
)
from tests.tool_caller import ToolCaller


@pytest.mark.anyio
async def test_extract_pii(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """extract_pii calls platform handler and returns JSON result with summary."""
    pii_json = json.dumps({
        "PIIBoxes": [
            {
                "pageIndex": 0,
                "boundingBox": [100, 200, 50, 20],
                "PIIType": "type-1",
                "text": "text-1",
                "confidence": 0.9,
            },
            {
                "pageIndex": 1,
                "boundingBox": [150, 300, 60, 25],
                "PIIType": "type-2",
                "text": "text-2",
                "confidence": 0.8,
            },
        ]
    }).encode()

    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pii_bounding_boxes.return_value = pii_json
    files_handler_mock.write.return_value = tmp_path / "doc-pii.json"

    await tool_caller.call(
        "extract_pii",
        ExtractPIIRequest(input_filename=tmp_path / "doc.pdf", language="en"),
        expected_result=ExtractPIIResult(
            output_filename="doc-pii.json",
            total_entities=2,
            entities_by_type={"type-1": 1, "type-2": 1},
            average_confidence=0.85,
        ),
    )

    files_handler_mock.read.assert_called_once_with(tmp_path / "doc.pdf")
    platform_handler_mock.extract_pii_bounding_boxes.assert_called_once_with(b"pdf-content", "en")
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "doc.pdf", pii_json, stem_suffix="pii", ext="json"
    )


@pytest.mark.anyio
async def test_extract_pii_spanish(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """extract_pii supports Spanish language."""
    pii_json = json.dumps({"PIIBoxes": []}).encode()

    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pii_bounding_boxes.return_value = pii_json
    files_handler_mock.write.return_value = tmp_path / "doc-pii.json"

    await tool_caller.call(
        "extract_pii",
        ExtractPIIRequest(input_filename=tmp_path / "doc.pdf", language="es"),
        expected_result=ExtractPIIResult(
            output_filename="doc-pii.json",
            total_entities=0,
            entities_by_type={},
            average_confidence=0.0,
        ),
    )

    platform_handler_mock.extract_pii_bounding_boxes.assert_called_once_with(b"pdf-content", "es")


@pytest.mark.anyio
async def test_redact_pdf(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """redact_pdf calls platform handler with redaction areas."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.redact_pdf.return_value = b"redacted-content"
    files_handler_mock.write.return_value = tmp_path / "doc-redacted.pdf"

    await tool_caller.call(
        "redact_pdf",
        RedactPDFRequest(
            input_filename=tmp_path / "doc.pdf",
            redactions=[
                RedactionArea(pageIndex=0, boundingBox=[100, 200, 50, 20]),
                RedactionArea(pageIndex=1, boundingBox=[150, 300, 60, 25]),
            ],
        ),
        expected_result=RedactPDFResult(output_filename="doc-redacted.pdf", redaction_count=2),
    )

    files_handler_mock.read.assert_called_once_with(tmp_path / "doc.pdf")
    platform_handler_mock.redact_pdf.assert_called_once_with(
        b"pdf-content",
        [
            {"pageIndex": 0, "boundingBox": [100.0, 200.0, 50.0, 20.0]},
            {"pageIndex": 1, "boundingBox": [150.0, 300.0, 60.0, 25.0]},
        ],
    )
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "doc.pdf", b"redacted-content", stem_suffix="redacted"
    )


@pytest.mark.anyio
async def test_redact_pdf_single_area(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """redact_pdf works with single redaction area."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.redact_pdf.return_value = b"redacted-content"
    files_handler_mock.write.return_value = tmp_path / "doc-redacted.pdf"

    await tool_caller.call(
        "redact_pdf",
        RedactPDFRequest(
            input_filename=tmp_path / "doc.pdf",
            redactions=[RedactionArea(pageIndex=2, boundingBox=[10, 20, 30, 40])],
        ),
        expected_result=RedactPDFResult(output_filename="doc-redacted.pdf", redaction_count=1),
    )

    platform_handler_mock.redact_pdf.assert_called_once_with(
        b"pdf-content", [{"pageIndex": 2, "boundingBox": [10.0, 20.0, 30.0, 40.0]}]
    )


@pytest.mark.anyio
async def test_redact_pdf_with_pii_json(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """redact_pdf can read PII JSON file and extract redactions automatically."""
    pii_json = json.dumps({
        "PIIBoxes": [
            {
                "pageIndex": 0,
                "boundingBox": [100, 200, 50, 20],
                "PIIType": "type-1",
                "text": "text-1",
                "confidence": 0.9,
            },
            {
                "pageIndex": 1,
                "boundingBox": [150, 300, 60, 25],
                "PIIType": "type-2",
                "text": "text-2",
                "confidence": 0.8,
            },
        ]
    }).encode()

    files_handler_mock.read.side_effect = [b"pdf-content", pii_json]
    platform_handler_mock.redact_pdf.return_value = b"redacted-content"
    files_handler_mock.write.return_value = tmp_path / "doc-redacted.pdf"

    await tool_caller.call(
        "redact_pdf",
        RedactPDFRequest(
            input_filename=tmp_path / "doc.pdf",
            pii_json_file=tmp_path / "doc-pii.json",
        ),
        expected_result=RedactPDFResult(output_filename="doc-redacted.pdf", redaction_count=2),
    )

    assert files_handler_mock.read.call_count == 2
    files_handler_mock.read.assert_any_call(tmp_path / "doc.pdf")
    files_handler_mock.read.assert_any_call(tmp_path / "doc-pii.json")
    platform_handler_mock.redact_pdf.assert_called_once_with(
        b"pdf-content",
        [
            {"pageIndex": 0, "boundingBox": [100.0, 200.0, 50.0, 20.0]},
            {"pageIndex": 1, "boundingBox": [150.0, 300.0, 60.0, 25.0]},
        ],
    )


@pytest.mark.anyio
async def test_extract_pii_file_not_found(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """extract_pii raises error when file not found."""
    files_handler_mock.read.side_effect = FileNotFoundError("File not found")

    await tool_caller.call(
        "extract_pii",
        ExtractPIIRequest(input_filename=tmp_path / "missing.pdf"),
        expect_error=True,
    )


@pytest.mark.anyio
async def test_redact_pdf_neither_redactions_nor_json(
    tool_caller: ToolCaller,
    tmp_path: Path,
) -> None:
    """redact_pdf requires either redactions or pii_json_file."""
    await tool_caller.call(
        "redact_pdf",
        {"input_filename": str(tmp_path / "doc.pdf")},
        expect_error=True,
    )


@pytest.mark.anyio
async def test_redact_pdf_invalid_pii_json(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """redact_pdf raises error when PII JSON format is invalid."""
    invalid_json = json.dumps({"invalid": "structure"}).encode()
    files_handler_mock.read.side_effect = [b"pdf-content", invalid_json]

    await tool_caller.call(
        "redact_pdf",
        RedactPDFRequest(
            input_filename=tmp_path / "doc.pdf",
            pii_json_file=tmp_path / "invalid.json",
        ),
        expect_error=True,
    )


@pytest.mark.anyio
async def test_redact_pdf_platform_error(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """redact_pdf propagates platform handler errors."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.redact_pdf.side_effect = RuntimeError("Platform API error")

    await tool_caller.call(
        "redact_pdf",
        RedactPDFRequest(
            input_filename=tmp_path / "doc.pdf",
            redactions=[RedactionArea(pageIndex=0, boundingBox=[1, 2, 3, 4])],
        ),
        expect_error=True,
    )
