# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""File extraction tools for MCP server"""

from pathlib import Path
from typing import Literal

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

from app.context import CoreContext, get_dep
from app.handlers.platform_handler import ExtractionDataType, ExtractionParams
from app.models import SingleFileOutputBase
from app.utils import FormsResult, TablesResult, create_forms_excel, create_tables_excel


class PDFMetadataRequest(BaseModel):
    """Request model for PDF metadata extraction"""

    input_filename: Path = Field(description="Filename of the source file in the workspace")


class PDFMetadataResult(SingleFileOutputBase):
    """Result of a PDF metadata extraction operation"""

    input_filename: str = Field(description="Filename of the source file in the workspace")


class ExtractPDFFormsRequest(BaseModel):
    """Request model for PDF forms extraction"""

    input_filename: Path = Field(description="Filename of the source PDF file in the workspace")
    language: str = Field(default="en", description="Language code for form extraction")
    output_format: Literal["json", "excel"] = Field(
        default="excel",
        description="Output format: 'excel' (default) or 'json'",
    )


class ExtractPDFTablesRequest(BaseModel):
    """Request model for PDF tables extraction"""

    input_filename: Path = Field(description="Filename of the source PDF file in the workspace")
    page_indices: list[int] | None = Field(
        default=None,
        description="Zero-based page indices to extract from",
    )
    output_format: Literal["json", "excel"] = Field(
        default="excel",
        description="Output format: 'excel' (default) or 'json'",
    )


class ExtractPDFTextRequest(BaseModel):
    """Request model for PDF text extraction"""

    input_filename: Path = Field(description="Filename of the source PDF file in the workspace")
    page_indices: list[int] | None = Field(
        default=None,
        description="Zero-based page indices to extract from",
    )
    reading_order: bool = Field(
        default=False,
        description="Whether to use reading order for text extraction",
    )


class ExtractPDFAccessibilityRequest(BaseModel):
    """Request model for PDF accessibility data extraction"""

    input_filename: Path = Field(description="Filename of the source PDF file in the workspace")


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


def extract_pdf_forms(ctx: CoreContext, request: ExtractPDFFormsRequest) -> ExtractPDFDataResult:
    """Extract form fields from a PDF file."""
    platform_handler = get_dep(ctx, "platform-handler")
    files_handler = get_dep(ctx, "files-handler")

    input_bytes = files_handler.read(request.input_filename)
    result = platform_handler.extract_pdf_data(
        input_bytes, "forms", ExtractionParams(language=request.language)
    )

    if request.output_format == "excel":
        forms_result = FormsResult.model_validate_json(result)
        if not forms_result.fields:
            msg = "No data available to generate Excel output"
            raise ValueError(msg)
        excel_bytes = create_forms_excel(
            forms_result.fields,
            str(request.input_filename),
            forms_result.average_confidence,
        )
        output_path = files_handler.write(
            request.input_filename, excel_bytes, stem_suffix="forms", ext="xlsx"
        )
    else:
        output_path = files_handler.write(
            request.input_filename, result, stem_suffix="forms", ext="json"
        )

    return ExtractPDFDataResult(
        input_filename=str(request.input_filename),
        output_filename=output_path.name,
        data_type="forms",
    )


def extract_pdf_tables(ctx: CoreContext, request: ExtractPDFTablesRequest) -> ExtractPDFDataResult:
    """Extract tables from a PDF file."""
    platform_handler = get_dep(ctx, "platform-handler")
    files_handler = get_dep(ctx, "files-handler")

    input_bytes = files_handler.read(request.input_filename)
    params = ExtractionParams()
    if request.page_indices is not None:
        params["pageIndices"] = request.page_indices
    result = platform_handler.extract_pdf_data(input_bytes, "tables", params)

    if request.output_format == "excel":
        tables_result = TablesResult.model_validate_json(result)
        if not tables_result.tables:
            msg = "No data available to generate Excel output"
            raise ValueError(msg)
        excel_bytes = create_tables_excel(tables_result.tables, str(request.input_filename))
        output_path = files_handler.write(
            request.input_filename, excel_bytes, stem_suffix="tables", ext="xlsx"
        )
    else:
        output_path = files_handler.write(
            request.input_filename, result, stem_suffix="tables", ext="json"
        )

    return ExtractPDFDataResult(
        input_filename=str(request.input_filename),
        output_filename=output_path.name,
        data_type="tables",
    )


def extract_pdf_text(ctx: CoreContext, request: ExtractPDFTextRequest) -> ExtractPDFDataResult:
    """Extract text from a PDF file."""
    platform_handler = get_dep(ctx, "platform-handler")
    files_handler = get_dep(ctx, "files-handler")

    input_bytes = files_handler.read(request.input_filename)
    params = ExtractionParams(readingOrder=request.reading_order)
    if request.page_indices is not None:
        params["pageIndices"] = request.page_indices
    result = platform_handler.extract_pdf_data(input_bytes, "text", params)

    output_path = files_handler.write(
        request.input_filename, result, stem_suffix="text", ext="json"
    )
    return ExtractPDFDataResult(
        input_filename=str(request.input_filename),
        output_filename=output_path.name,
        data_type="text",
    )


def extract_pdf_accessibility(
    ctx: CoreContext, request: ExtractPDFAccessibilityRequest
) -> ExtractPDFDataResult:
    """Extract accessibility data from a PDF file."""
    platform_handler = get_dep(ctx, "platform-handler")
    files_handler = get_dep(ctx, "files-handler")

    input_bytes = files_handler.read(request.input_filename)
    result = platform_handler.extract_pdf_data(input_bytes, "accessibility", ExtractionParams())

    output_path = files_handler.write(
        request.input_filename, result, stem_suffix="accessibility", ext="json"
    )
    return ExtractPDFDataResult(
        input_filename=str(request.input_filename),
        output_filename=output_path.name,
        data_type="accessibility",
    )


def register_extraction_tools(mcp: FastMCP) -> None:
    """Register extraction tools with the MCP server"""
    mcp.tool(description="Use this tool when the user asks for the metadata of a PDF file.")(
        get_pdf_metadata
    )

    mcp.tool(
        description=(
            "Use this tool to extract form fields from a PDF file. "
            "Output formats: 'excel' (always the default) "
            "or a 'json' if explicitly requested. "
            "Parameters: language (default 'en')."
        )
    )(extract_pdf_forms)

    mcp.tool(
        description=(
            "Use this tool to extract tables from a PDF file. "
            "Output formats: 'excel' (always the default) "
            "or a 'json' if explicitly requested. "
            "Parameters: page_indices (optional, zero-based)."
        )
    )(extract_pdf_tables)

    mcp.tool(
        description=(
            "Use this tool to extract text from a PDF file. "
            "Output is always JSON. "
            "Parameters: page_indices (optional, zero-based), reading_order (default False)."
        )
    )(extract_pdf_text)

    mcp.tool(
        description=(
            "Use this tool to extract accessibility data from a PDF file. Output is always JSON."
        )
    )(extract_pdf_accessibility)
