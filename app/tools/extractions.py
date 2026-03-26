# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""File extraction tools for MCP server"""

import json
from pathlib import Path
from typing import Any, Literal

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

from app.context import CoreContext, get_dep
from app.handlers.platform_handler import ExtractionDataType, ExtractionParams
from app.models import SingleFileOutputBase
from app.utils.excel_helpers import create_forms_excel, create_tables_excel


class PDFMetadataRequest(BaseModel):
    """Request model for PDF metadata extraction"""

    input_filename: Path = Field(description="Filename of the source file in the workspace")


class PDFMetadataResult(SingleFileOutputBase):
    """Result of a PDF metadata extraction operation"""

    input_filename: str = Field(description="Filename of the source file in the workspace")


class ExtractPDFDataRequest(BaseModel):
    """Request model for PDF data extraction"""

    input_filename: Path = Field(description="Filename of the source PDF file in the workspace")
    data_type: ExtractionDataType = Field(
        description="Type of data to extract: 'forms', 'tables', 'text', or 'accessibility'"
    )
    language: str = Field(
        default="en", description="Language code for form extraction (only used with 'forms')"
    )
    page_indices: list[int] | None = Field(
        default=None,
        description="Zero-based page indices to extract from (only used with 'tables' and 'text')",
    )
    reading_order: bool = Field(
        default=False,
        description="Whether to use reading order for text extraction (only used with 'text')",
    )
    output_format: Literal["json", "excel"] = Field(
        default="json",
        description=(
            "Output format: 'json' (default) or 'excel' (only supported for 'forms' and 'tables')"
        ),
    )


class ExtractPDFDataResult(SingleFileOutputBase):
    """Result of a PDF data extraction operation"""

    input_filename: str = Field(description="Filename of the source file in the workspace")
    data_type: ExtractionDataType = Field(description="Type of data that was extracted")


def get_pdf_metadata(ctx: CoreContext, request: PDFMetadataRequest) -> PDFMetadataResult:
    """Get metadata properties from a PDF file."""
    platform_handler = get_dep(ctx, "platform-handler")
    files_handler = get_dep(ctx, "files-handler")

    input_bytes = files_handler.read(request.input_filename)
    metadata = platform_handler.get_pdf_metadata(input_bytes)
    output_path = files_handler.write(
        request.input_filename, metadata, stem_suffix="metadata", ext="json"
    )
    return PDFMetadataResult(
        input_filename=str(request.input_filename), output_filename=output_path.name
    )


def extract_pdf_data(  # noqa: C901
    ctx: CoreContext, request: ExtractPDFDataRequest
) -> ExtractPDFDataResult:
    """Extract structured data (forms, tables, text, or accessibility) from a PDF file."""
    if request.output_format == "excel" and request.data_type not in ("forms", "tables"):
        msg = f"Excel output is only supported for forms and tables, not '{request.data_type}'"
        raise ValueError(msg)

    platform_handler = get_dep(ctx, "platform-handler")
    files_handler = get_dep(ctx, "files-handler")

    input_bytes = files_handler.read(request.input_filename)
    params = ExtractionParams()
    if request.data_type == "forms":
        params["language"] = request.language
    if request.data_type in ("tables", "text") and request.page_indices is not None:
        params["pageIndices"] = request.page_indices
    if request.data_type == "text":
        params["readingOrder"] = request.reading_order
    result = platform_handler.extract_pdf_data(input_bytes, request.data_type, params)

    if request.output_format == "excel":
        parsed: dict[str, Any] = json.loads(result)
        excel_bytes: bytes | None = None
        if request.data_type == "forms":
            fields: list[dict[str, Any]] = parsed.get("fields", [])
            if fields:
                avg_confidence: float = parsed.get("averageConfidence", 0)
                excel_bytes = create_forms_excel(
                    fields, str(request.input_filename), avg_confidence
                )
        elif request.data_type == "tables":
            tables: list[dict[str, Any]] = parsed.get("tables", [])
            if tables:
                excel_bytes = create_tables_excel(tables, str(request.input_filename))
        if excel_bytes is None:
            msg = "No data available to generate Excel output"
            raise ValueError(msg)
        output_path = files_handler.write(
            request.input_filename, excel_bytes, stem_suffix=request.data_type, ext="xlsx"
        )
    else:
        output_path = files_handler.write(
            request.input_filename, result, stem_suffix=request.data_type, ext="json"
        )

    return ExtractPDFDataResult(
        input_filename=str(request.input_filename),
        output_filename=output_path.name,
        data_type=request.data_type,
    )


def register_extraction_tools(mcp: FastMCP) -> None:
    """Register extraction tools with the MCP server"""
    get_metadata_description = "Use this tool when the user asks for the metadata of a PDF file."
    mcp.tool(description=get_metadata_description)(get_pdf_metadata)

    extract_data_description = (
        "Use this tool to extract structured data from a PDF file. "
        "Supports extracting forms, tables, text, or accessibility data. "
        "Output formats: 'json' (all types) or 'excel' (forms and tables only). "
        "Parameters: language (forms), page_indices (tables/text), reading_order (text)."
    )
    mcp.tool(description=extract_data_description)(extract_pdf_data)
