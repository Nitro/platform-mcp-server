# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""File extraction tools for MCP server"""

from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from app.context import CoreContext, get_dep
from app.models import SingleFileOutputBase

if TYPE_CHECKING:
    from mcp.server.fastmcp import FastMCP


class PDFMetadataRequest(BaseModel):
    """Request model for PDF metadata extraction"""

    input_filename: Path = Field(description="Filename of the source file in the workspace")


class PDFMetadataResult(SingleFileOutputBase):
    """Result of a PDF metadata extraction operation"""

    input_filename: str = Field(description="Filename of the source file in the workspace")


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


def register_extraction_tools(mcp: FastMCP) -> None:
    """Register transformation tools with the MCP server"""
    get_metadata_description = "Use this tool when the user asks for the metadata of a PDF file."
    mcp.tool(description=get_metadata_description)(get_pdf_metadata)
