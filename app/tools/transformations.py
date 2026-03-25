# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""PDF transformation tools for MCP server"""

from pathlib import Path
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from app.context import CoreContext, get_dep
from app.models import SingleFileOutputBase

if TYPE_CHECKING:
    from mcp.server.fastmcp import FastMCP


class MergeRequest(BaseModel):
    """Request to merge multiple files into one"""

    input_filenames: list[str] = Field(
        min_length=2,
        description="Filenames to merge from workspace. Must be at least 2 files.",
    )
    output_filename: str = Field(
        default="merged.pdf",
        description="Output filename for the merged file.",
    )


class MergeResult(SingleFileOutputBase):
    """Result of merging PDF files"""

    input_filenames: list[str] = Field(description="List of input filenames that were merged")
    input_count: int = Field(description="Number of files merged")
    total_input_size_bytes: int = Field(description="Total size of input files in bytes")
    output_size_bytes: int = Field(description="Size of merged output file in bytes")


def merge_files(ctx: CoreContext, request: MergeRequest) -> MergeResult:
    """
    Merge multiple PDF files from the workspace into one PDF.

    Args:
        merge_request: Request containing input filenames and output filename

    Returns:
        MergeResult with details about the merge operation

    Raises:
        FileNotFoundError: If any input file doesn't exist
        RuntimeError: If merge operation fails
    """
    files_handler = get_dep(ctx, "files-handler")
    platform_handler = get_dep(ctx, "platform-handler")

    file_contents: list[bytes] = []
    total_size = 0

    for filename in request.input_filenames:
        content = files_handler.read(Path(filename))
        file_contents.append(content)
        total_size += len(content)

    merged_bytes = platform_handler.merge_pdfs(file_contents)

    written = files_handler.write(request.output_filename, merged_bytes)

    return MergeResult(
        output_filename=written.name,
        input_filenames=request.input_filenames,
        input_count=len(request.input_filenames),
        total_input_size_bytes=total_size,
        output_size_bytes=len(merged_bytes),
    )


def register_transformation_tool(mcp: FastMCP) -> None:
    """Register transformation tools with the MCP server"""
    mcp.tool()(merge_files)
