# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""PII detection and redaction tools for MCP server"""

from collections import Counter
from pathlib import Path
from typing import Literal

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

from app.context import CoreContext, get_dep
from app.models import BoundingBoxArea, SingleFileInputBase, SingleFileOutputBase


class ExtractPIIRequest(SingleFileInputBase):
    """Request to extract PII with bounding boxes from a PDF"""

    language: Literal["en", "es"] = Field(
        default="en",
        description="Language code for PII detection (en=English, es=Spanish)",
    )


class ExtractPIIResult(SingleFileOutputBase):
    """Result of PII extraction with bounding boxes"""

    total_entities: int = Field(description="Total number of PII entities detected")
    entities_by_type: dict[str, int] = Field(description="Count of entities grouped by PII type")
    average_confidence: float = Field(description="Average detection confidence score (0-1)")


class PIIBox(BoundingBoxArea):
    """PII detection box from platform API"""

    pii_type: str = Field(alias="PIIType", description="Type of PII detected")
    text: str = Field(description="Detected text")
    confidence: float = Field(description="Detection confidence")


class PIIDetectionResult(BaseModel):
    """PII detection result structure from platform API"""

    pii_boxes: list[PIIBox] = Field(alias="PIIBoxes", description="List of detected PII entities")


class RedactionArea(BoundingBoxArea):
    """Represents a single redaction area on a page"""


class RedactPDFRequest(SingleFileInputBase):
    """Request to redact specific areas of a PDF"""

    redactions: list[RedactionArea] | None = Field(
        default=None,
        description="List of areas to redact. Each area specifies a page and bounding box.",
    )
    pii_json_file: Path | None = Field(
        default=None,
        description=(
            "Full path to PII detection JSON file (from extract_pii tool). "
            "If provided, redactions will be extracted automatically from this file."
        ),
    )


class RedactPDFResult(SingleFileOutputBase):
    """Result of manual PDF redaction"""

    redaction_count: int = Field(description="Number of areas redacted")


async def extract_pii(ctx: CoreContext, request: ExtractPIIRequest) -> ExtractPIIResult:
    """Extract PII from a PDF with bounding box coordinates.

    Returns a complete JSON file containing all detected PII entities with bounding boxes,
    confidence scores, and page locations. The output is immediately usable and requires
    no additional processing.
    """
    files_handler = get_dep(ctx, "files-handler")
    platform_handler = get_dep(ctx, "platform-handler")

    input_bytes = files_handler.read(request.input_path)

    pii_json = platform_handler.extract_pii_bounding_boxes(input_bytes, request.language)

    pii_result = PIIDetectionResult.model_validate_json(pii_json)

    total_entities = len(pii_result.pii_boxes)
    entities_by_type = dict(Counter(box.pii_type for box in pii_result.pii_boxes))
    confidences = [box.confidence for box in pii_result.pii_boxes]
    average_confidence = sum(confidences) / len(confidences) if confidences else 0.0

    output_path = files_handler.write(request.input_path, pii_json, stem_suffix="pii", ext="json")

    return ExtractPIIResult(
        output_filename=output_path.name,
        total_entities=total_entities,
        entities_by_type=entities_by_type,
        average_confidence=round(average_confidence, 3),
    )


async def redact_pdf(ctx: CoreContext, request: RedactPDFRequest) -> RedactPDFResult:
    """Redact specific areas of a PDF using bounding box coordinates.

    Blacks out sensitive information at the specified page indices and bounding box
    coordinates. Can accept either manual redaction coordinates OR a PII JSON file
    from extract_pii tool (which will extract coordinates automatically).
    """
    files_handler = get_dep(ctx, "files-handler")
    platform_handler = get_dep(ctx, "platform-handler")

    input_bytes = files_handler.read(request.input_path)

    if request.pii_json_file:
        json_bytes = files_handler.read(request.pii_json_file)

        pii_result = PIIDetectionResult.model_validate_json(json_bytes)

        if not pii_result.pii_boxes:
            msg = "No PII detections found in JSON file"
            raise ValueError(msg)

        redactions = [
            {
                "pageIndex": box.page_index,
                "boundingBox": list(box.bounding_box),
            }
            for box in pii_result.pii_boxes
        ]

    elif request.redactions:
        redactions = [
            {
                "pageIndex": r.page_index,
                "boundingBox": list(r.bounding_box),
            }
            for r in request.redactions
        ]
    else:
        msg = "Either redactions or pii_json_file must be provided"
        raise ValueError(msg)

    redacted_bytes = platform_handler.redact_pdf(input_bytes, redactions)

    written = files_handler.write(request.input_path, redacted_bytes, stem_suffix="redacted")

    return RedactPDFResult(
        output_filename=written.name,
        redaction_count=len(redactions),
    )


def register(mcp: FastMCP) -> None:
    """Register PII tools with the MCP server"""
    mcp.tool(
        description=(
            "Use this tool to extract PII (Personally Identifiable Information) from a PDF file. "
            "Returns a JSON file with detected PII entities, bounding boxes, and confidence scores."
        )
    )(extract_pii)

    mcp.tool(
        description=(
            "Use this tool to redact a PDF file. You can either: "
            "(1) Provide a pii_json_file path (output from extract_pii tool) to automatically "
            "redact all detected PII, OR "
            "(2) Provide manual redactions with page indices and bounding box coordinates. "
            "The tool will apply redactions and save a redacted PDF."
        )
    )(redact_pdf)
