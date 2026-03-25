# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""File conversion tools for MCP server"""

from pathlib import Path

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

from app.client import FileFormat
from app.context import CoreContext, get_dep
from app.handlers import PlatformHandler
from app.models import SingleFileOutputBase


class ConversionRequest(BaseModel):
    """Request to convert a file to a different format"""

    input_path: Path = Field(description="Relative path to the source file")

    # We deliberately don't use `to` as an enum here. We have to explain to the LLM in the
    # description the supported conversion matrix. So we enumerate all the allowed values there.
    # To do so again here would muddy the context
    to: str = Field(description="Format to convert the file to")


class ConversionResult(SingleFileOutputBase):
    """Result of a file conversion operation"""

    input_path: str = Field(description="Relative path to the source file")


async def convert_file(ctx: CoreContext, request: ConversionRequest) -> ConversionResult:
    """Convert a file using the platform handler's conversion capabilities"""
    platform_handler = get_dep(ctx, "platform-handler")
    files_handler = get_dep(ctx, "files-handler")

    input_bytes = files_handler.read(request.input_path)
    converted_bytes = platform_handler.convert_file(
        input_bytes,
        FileFormat(request.input_path.suffix.lstrip(".").lower()),
        FileFormat(request.to),
    )
    output_path = files_handler.write_timestamped(
        "converted", request.input_path.stem, request.to, converted_bytes
    )
    return ConversionResult(input_path=str(request.input_path), output_path=str(output_path.name))


def register_conversion_tool(mcp: FastMCP) -> None:
    """Register conversion tools with the MCP server"""
    from_pdf_to = ", ".join(f.value for f in PlatformHandler.supported_conversions.from_pdf_to)
    to_pdf_from = ", ".join(f.value for f in PlatformHandler.supported_conversions.to_pdf_from)
    description = (
        "Use this tool when the user asks to convert a file.\n"
        "The following conversions are supported:\n"
        f"Convert from a pdf to {from_pdf_to}.\n"
        f"Convert from a {to_pdf_from} to pdf.\n"
        "Use list_files first if you need to discover available files."
    )
    mcp.tool(description=description)(convert_file)
