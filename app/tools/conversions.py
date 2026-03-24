# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""File conversion tools for MCP server"""

import sys
from datetime import datetime
from pathlib import Path

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

from app.client import SUPPORTED_CONVERSIONS, FileFormat
from app.context import CoreContext, get_dep


class ConversionRequest(BaseModel):
    """Request to convert a file to a different format"""

    input_path: Path = Field(description="Relative path to the source file")

    # We deliberately don't use `to` as an enum here. We have to explain to the LLM in the
    # description the supported conversion matrix. So we enumerate all the allowed values there.
    # To do so again here would muddy the context
    to: str = Field(description="Format to convert the file to")


class ConversionResult(BaseModel):
    """Result of a file conversion operation"""

    input_path: str = Field(description="Relative path to the source file")
    output_path: str = Field(description="Relative path to the converted output file")


async def convert_file(ctx: CoreContext, request: ConversionRequest) -> ConversionResult:
    """Convert a file using the platform handler's conversion capabilities"""
    platform_handler = get_dep(ctx, "platform-handler")
    files_folder = get_dep(ctx, "files-folder")

    input_path = files_folder / request.input_path
    if not input_path.exists():
        msg = f"Input file does not exist: {input_path}"
        raise FileNotFoundError(msg)

    converted_bytes = platform_handler.convert_file(
        input_path.read_bytes(),
        FileFormat(input_path.suffix.lstrip(".").lower()),
        FileFormat(request.to),
    )
    timestamp = datetime.now().astimezone().strftime("%Y-%m-%dT%H%M%S")
    output_name = f"converted-{input_path.stem}-{timestamp}.{request.to}"
    output_path = input_path.parent / output_name
    output_path.write_bytes(converted_bytes)
    print(f"Converted to {output_path}", file=sys.stderr)
    return ConversionResult(input_path=str(input_path), output_path=str(output_path.name))


def register_conversion_tool(mcp: FastMCP) -> None:
    """Register conversion tools with the MCP server"""

    from_pdf_to = ", ".join(SUPPORTED_CONVERSIONS["from_pdf_to"])
    to_pdf_from = ", ".join(SUPPORTED_CONVERSIONS["to_pdf_from"])
    description = (
        "Use this tool when the user asks to convert a file.\n"
        "The following conversions are supported:\n"
        f"Convert from a pdf to {from_pdf_to}.\n"
        f"Convert from a {to_pdf_from} to pdf.\n"
        "Use list_files first if you need to discover available files."
    )
    print(description, file=sys.stderr)
    mcp.tool(description=description)(convert_file)
