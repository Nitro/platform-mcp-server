# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for PII detection and redaction tools"""

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from mcp import ClientSession

from app.tools.pii import (
    ExtractPIIRequest,
    ExtractPIIResult,
    RedactionArea,
    RedactPDFRequest,
    RedactPDFResult,
)


@pytest.mark.anyio
async def test_extract_pii(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pii calls platform handler and returns JSON result with summary."""
    # Setup - use PIIBoxes format that matches our Pydantic model
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
    files_handler_mock.write.return_value = Path("doc-pii.json")

    # Call
    response = await client.call_tool(
        "extract_pii",
        {
            "request": ExtractPIIRequest(input_filename=Path("doc.pdf"), language="en").model_dump(
                mode="json"
            )
        },
    )

    # Assert
    expected = ExtractPIIResult(
        output_filename="doc-pii.json",
        total_entities=2,
        entities_by_type={"type-1": 1, "type-2": 1},
        average_confidence=0.85,
    ).model_dump()
    assert response.structuredContent == expected

    files_handler_mock.read.assert_called_once_with(Path("doc.pdf"))
    platform_handler_mock.extract_pii_bounding_boxes.assert_called_once_with(b"pdf-content", "en")
    files_handler_mock.write.assert_called_once_with(
        Path("doc.pdf"), pii_json, stem_suffix="pii", ext="json"
    )


@pytest.mark.anyio
async def test_extract_pii_spanish(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """extract_pii supports Spanish language."""
    # Setup - empty PII detection result
    pii_json = json.dumps({"PIIBoxes": []}).encode()

    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.extract_pii_bounding_boxes.return_value = pii_json
    files_handler_mock.write.return_value = Path("doc-pii.json")

    # Call
    response = await client.call_tool(
        "extract_pii",
        {
            "request": ExtractPIIRequest(input_filename=Path("doc.pdf"), language="es").model_dump(
                mode="json"
            )
        },
    )

    # Assert
    expected = ExtractPIIResult(
        output_filename="doc-pii.json",
        total_entities=0,
        entities_by_type={},
        average_confidence=0.0,
    ).model_dump()
    assert response.structuredContent == expected

    platform_handler_mock.extract_pii_bounding_boxes.assert_called_once_with(b"pdf-content", "es")


@pytest.mark.anyio
async def test_redact_pdf(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """redact_pdf calls platform handler with redaction areas."""
    # Setup
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.redact_pdf.return_value = b"redacted-content"
    files_handler_mock.write.return_value = Path("doc-redacted.pdf")

    # Call
    response = await client.call_tool(
        "redact_pdf",
        {
            "request": RedactPDFRequest(
                input_filename=Path("doc.pdf"),
                redactions=[
                    RedactionArea(pageIndex=0, boundingBox=(100, 200, 50, 20)),
                    RedactionArea(pageIndex=1, boundingBox=(150, 300, 60, 25)),
                ],
            ).model_dump(mode="json")
        },
    )

    # Assert
    expected = RedactPDFResult(output_filename="doc-redacted.pdf", redaction_count=2).model_dump()
    assert response.structuredContent == expected

    files_handler_mock.read.assert_called_once_with(Path("doc.pdf"))
    platform_handler_mock.redact_pdf.assert_called_once_with(
        b"pdf-content",
        [
            {"pageIndex": 0, "boundingBox": [100.0, 200.0, 50.0, 20.0]},
            {"pageIndex": 1, "boundingBox": [150.0, 300.0, 60.0, 25.0]},
        ],
    )
    files_handler_mock.write.assert_called_once_with(
        Path("doc.pdf"), b"redacted-content", stem_suffix="redacted"
    )


@pytest.mark.anyio
async def test_redact_pdf_single_area(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """redact_pdf works with single redaction area."""
    # Setup
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.redact_pdf.return_value = b"redacted-content"
    files_handler_mock.write.return_value = Path("doc-redacted.pdf")

    # Call
    response = await client.call_tool(
        "redact_pdf",
        {
            "request": RedactPDFRequest(
                input_filename=Path("doc.pdf"),
                redactions=[
                    RedactionArea(pageIndex=2, boundingBox=(10, 20, 30, 40)),
                ],
            ).model_dump(mode="json")
        },
    )

    # Assert
    expected = RedactPDFResult(output_filename="doc-redacted.pdf", redaction_count=1).model_dump()
    assert response.structuredContent == expected

    platform_handler_mock.redact_pdf.assert_called_once_with(
        b"pdf-content", [{"pageIndex": 2, "boundingBox": [10.0, 20.0, 30.0, 40.0]}]
    )


@pytest.mark.anyio
async def test_redact_pdf_with_pii_json(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """redact_pdf can read PII JSON file and extract redactions automatically."""
    # Setup - PII JSON with detected entities
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
    files_handler_mock.write.return_value = Path("doc-redacted.pdf")

    # Call with PII JSON file
    response = await client.call_tool(
        "redact_pdf",
        {
            "request": RedactPDFRequest(
                input_filename=Path("doc.pdf"), pii_json_file=Path("doc-pii.json")
            ).model_dump(mode="json")
        },
    )

    # Assert
    expected = RedactPDFResult(output_filename="doc-redacted.pdf", redaction_count=2).model_dump()
    assert response.structuredContent == expected

    # Verify reads: first PDF, then PII JSON
    assert files_handler_mock.read.call_count == 2
    files_handler_mock.read.assert_any_call(Path("doc.pdf"))
    files_handler_mock.read.assert_any_call(Path("doc-pii.json"))

    # Verify redactions were extracted from PII JSON
    platform_handler_mock.redact_pdf.assert_called_once_with(
        b"pdf-content",
        [
            {"pageIndex": 0, "boundingBox": [100, 200, 50, 20]},
            {"pageIndex": 1, "boundingBox": [150, 300, 60, 25]},
        ],
    )


@pytest.mark.anyio
async def test_extract_pii_file_not_found(
    client: ClientSession,
    files_handler_mock: MagicMock,
) -> None:
    """extract_pii raises error when file not found."""
    files_handler_mock.read.side_effect = FileNotFoundError("File not found")

    response = await client.call_tool(
        "extract_pii",
        {"request": ExtractPIIRequest(input_filename=Path("missing.pdf")).model_dump(mode="json")},
    )

    assert response.isError


@pytest.mark.anyio
async def test_redact_pdf_neither_redactions_nor_json(
    client: ClientSession,
) -> None:
    """redact_pdf requires either redactions or pii_json_file."""
    response = await client.call_tool(
        "redact_pdf",
        {"request": {"input_filename": "doc.pdf"}},
    )

    assert response.isError


@pytest.mark.anyio
async def test_redact_pdf_invalid_pii_json(
    client: ClientSession,
    files_handler_mock: MagicMock,
) -> None:
    """redact_pdf raises error when PII JSON format is invalid."""
    # Setup - invalid JSON structure (missing PIIBoxes)
    invalid_json = json.dumps({"invalid": "structure"}).encode()

    files_handler_mock.read.side_effect = [b"pdf-content", invalid_json]

    response = await client.call_tool(
        "redact_pdf",
        {
            "request": RedactPDFRequest(
                input_filename=Path("doc.pdf"), pii_json_file=Path("invalid.json")
            ).model_dump(mode="json")
        },
    )

    assert response.isError


@pytest.mark.anyio
async def test_redact_pdf_platform_error(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """redact_pdf propagates platform handler errors."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.redact_pdf.side_effect = RuntimeError("Platform API error")

    response = await client.call_tool(
        "redact_pdf",
        {
            "request": RedactPDFRequest(
                input_filename=Path("doc.pdf"),
                redactions=[RedactionArea(pageIndex=0, boundingBox=(1, 2, 3, 4))],
            ).model_dump(mode="json")
        },
    )

    assert response.isError
