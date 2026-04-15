# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""File extraction tools for MCP server"""

import json
from typing import Literal

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

from app.context import CoreContext, get_dep
from app.handlers.platform_handler import ExtractionDataType, ExtractionParams
from app.models import BoundingBoxArea, SingleFileInputBase, SingleFileOutputBase
from app.utils import FormsResult, TablesResult, create_forms_excel, create_tables_excel


class PDFMetadataRequest(SingleFileInputBase):
    """Request model for PDF metadata extraction"""


class PDFMetadataResult(SingleFileOutputBase):
    """Result of a PDF metadata extraction operation"""


class ExtractPDFFormsRequest(SingleFileInputBase):
    """Request model for PDF forms extraction"""

    language: str = Field(default="en", description="Language code for form extraction")
    output_format: Literal["json", "excel"] = Field(
        default="excel",
        description="Output format: 'excel' (always the default) or 'json' if explicitly requested",
    )


class ExtractPDFTablesRequest(SingleFileInputBase):
    """Request model for PDF tables extraction"""

    page_indices: list[int] | None = Field(
        default=None,
        description="Zero-based page indices to extract from",
    )
    output_format: Literal["json", "excel"] = Field(
        default="excel",
        description="Output format: 'excel' (always the default) or 'json' if explicitly requested",
    )


class ExtractPDFTextRequest(SingleFileInputBase):
    """Request model for PDF text extraction"""

    page_indices: list[int] | None = Field(
        default=None,
        description="Zero-based page indices to extract from",
    )
    reading_order: bool = Field(
        default=False,
        description="Whether to use reading order for text extraction",
    )


class ExtractPDFAccessibilityRequest(SingleFileInputBase):
    """Request model for PDF accessibility data extraction"""


class ExtractPDFDataResult(SingleFileOutputBase):
    """Result of a PDF data extraction operation"""

    data_type: ExtractionDataType = Field(description="Type of data that was extracted")


class ExtractPDFTextResult(SingleFileOutputBase):
    """Result of PDF text extraction"""

    word_count: int = Field(description="Number of words in extracted text")
    character_count: int = Field(description="Number of characters in extracted text")
    page_count: int = Field(description="Number of pages extracted")


class SearchTextInPDFRequest(SingleFileInputBase):
    """Request model for searching text in PDF"""

    texts: list[str] = Field(
        description="List of text strings to search for in the PDF", min_length=1
    )


class _TextBox(BoundingBoxArea):
    """Text box from platform API"""

    text: str = Field(description="Found text string")


class _TextBoundingBoxesResult(BaseModel):
    """Text bounding boxes result structure from platform API"""

    text_boxes: list[_TextBox] = Field(alias="textBoxes", description="List of found text matches")


class SearchTextInPDFResult(SingleFileOutputBase):
    """Result of searching text in PDF"""

    total_matches: int = Field(description="Total number of text matches found")
    unique_texts_found: int = Field(description="Number of unique search texts that were found")


def get_pdf_metadata(ctx: CoreContext, request: PDFMetadataRequest) -> PDFMetadataResult:
    """Get metadata properties from a PDF file."""
    platform_handler = get_dep(ctx, "platform-handler")
    files_handler = get_dep(ctx, "files-handler")

    input_bytes = files_handler.read(request.input_path)
    metadata = platform_handler.get_pdf_metadata(input_bytes)
    output_path = files_handler.write(
        request.input_path, metadata, stem_suffix="metadata", ext="json"
    )
    return PDFMetadataResult(output_filename=output_path.name)


def extract_pdf_forms(ctx: CoreContext, request: ExtractPDFFormsRequest) -> ExtractPDFDataResult:
    """Extract form fields from a PDF file."""
    platform_handler = get_dep(ctx, "platform-handler")
    files_handler = get_dep(ctx, "files-handler")

    input_bytes = files_handler.read(request.input_path)
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
            str(request.input_path),
            forms_result.average_confidence,
        )
        output_path = files_handler.write(
            request.input_path, excel_bytes, stem_suffix="forms", ext="xlsx"
        )
    else:
        output_path = files_handler.write(
            request.input_path, result, stem_suffix="forms", ext="json"
        )

    return ExtractPDFDataResult(output_filename=output_path.name, data_type="forms")


def extract_pdf_tables(ctx: CoreContext, request: ExtractPDFTablesRequest) -> ExtractPDFDataResult:
    """Extract tables from a PDF file."""
    platform_handler = get_dep(ctx, "platform-handler")
    files_handler = get_dep(ctx, "files-handler")

    input_bytes = files_handler.read(request.input_path)
    params = ExtractionParams()
    if request.page_indices is not None:
        params["pageIndices"] = request.page_indices
    result = platform_handler.extract_pdf_data(input_bytes, "tables", params)

    if request.output_format == "excel":
        tables_result = TablesResult.model_validate_json(result)
        if not tables_result.tables:
            msg = "No data available to generate Excel output"
            raise ValueError(msg)
        excel_bytes = create_tables_excel(tables_result.tables, str(request.input_path))
        output_path = files_handler.write(
            request.input_path, excel_bytes, stem_suffix="tables", ext="xlsx"
        )
    else:
        output_path = files_handler.write(
            request.input_path, result, stem_suffix="tables", ext="json"
        )

    return ExtractPDFDataResult(output_filename=output_path.name, data_type="tables")


def extract_pdf_text(ctx: CoreContext, request: ExtractPDFTextRequest) -> ExtractPDFTextResult:
    """
    Extract text from a PDF file.

    Returns a text file containing the extracted text along with statistics about
    the extraction (word count, character count, pages extracted).
    """
    platform_handler = get_dep(ctx, "platform-handler")
    files_handler = get_dep(ctx, "files-handler")

    input_bytes = files_handler.read(request.input_path)
    params = ExtractionParams(readingOrder=request.reading_order)
    if request.page_indices is not None:
        params["pageIndices"] = request.page_indices
    result_json = platform_handler.extract_pdf_data(input_bytes, "text", params)

    extracted_text = json.loads(result_json)

    word_count = len(extracted_text.split())
    character_count = len(extracted_text)
    page_count = len(request.page_indices) if request.page_indices else 0

    output_path = files_handler.write(
        request.input_path, extracted_text.encode(), stem_suffix="text", ext="txt"
    )

    return ExtractPDFTextResult(
        output_filename=output_path.name,
        word_count=word_count,
        character_count=character_count,
        page_count=page_count,
    )


def extract_pdf_accessibility(
    ctx: CoreContext, request: ExtractPDFAccessibilityRequest
) -> ExtractPDFDataResult:
    """Extract accessibility data from a PDF file."""
    platform_handler = get_dep(ctx, "platform-handler")
    files_handler = get_dep(ctx, "files-handler")

    input_bytes = files_handler.read(request.input_path)
    result = platform_handler.extract_pdf_data(input_bytes, "accessibility", ExtractionParams())

    output_path = files_handler.write(
        request.input_path, result, stem_suffix="accessibility", ext="json"
    )

    return ExtractPDFDataResult(output_filename=output_path.name, data_type="accessibility")


def search_text_in_pdf(ctx: CoreContext, request: SearchTextInPDFRequest) -> SearchTextInPDFResult:
    """
    Search for specific text strings in a PDF and return their locations.

    Returns a JSON file containing all found text matches with their page locations
    and bounding box coordinates.
    """
    files_handler = get_dep(ctx, "files-handler")
    platform_handler = get_dep(ctx, "platform-handler")

    input_bytes = files_handler.read(request.input_path)

    text_boxes_json = platform_handler.extract_text_bounding_boxes(input_bytes, request.texts)

    text_boxes_result = _TextBoundingBoxesResult.model_validate_json(text_boxes_json)

    total_matches = len(text_boxes_result.text_boxes)
    unique_texts = {box.text for box in text_boxes_result.text_boxes}
    unique_texts_found = len(unique_texts)

    output_path = files_handler.write(
        request.input_path, text_boxes_json, stem_suffix="search", ext="json"
    )

    return SearchTextInPDFResult(
        output_filename=output_path.name,
        total_matches=total_matches,
        unique_texts_found=unique_texts_found,
    )


def register(mcp: FastMCP) -> None:
    """Register extraction tools with the MCP server"""
    mcp.tool(description="Use this tool when the user asks for the metadata of a PDF file.")(
        get_pdf_metadata
    )

    mcp.tool(description="Use this tool to extract form fields from a PDF file.")(extract_pdf_forms)

    mcp.tool(description="Use this tool to extract tables from a PDF file.")(extract_pdf_tables)

    mcp.tool(description="Use this tool to extract text from a PDF file.")(extract_pdf_text)

    mcp.tool(description="Use this tool to extract accessibility data from a PDF file.")(
        extract_pdf_accessibility
    )

    mcp.tool(
        description=(
            "Use this tool to search for specific text strings in a PDF and get their locations. "
            "Returns a JSON file with bounding box coordinates for each match."
        )
    )(search_text_in_pdf)
