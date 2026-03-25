# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""PDF transformation tools for MCP server"""

from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from app.context import CoreContext, get_dep

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


class MergeResult(BaseModel):
    """Result of merging PDF files"""

    output_filename: str = Field(description="Name of the merged output file")
    input_files: list[str] = Field(description="List of input filenames that were merged")
    input_count: int = Field(description="Number of files merged")
    total_input_size_bytes: int = Field(description="Total size of input files in bytes")
    output_size_bytes: int = Field(description="Size of merged output file in bytes")


def merge_files(ctx: CoreContext, merge_request: MergeRequest) -> MergeResult:
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
    files_folder = get_dep(ctx, "files-folder")
    platform_handler = get_dep(ctx, "platform-handler")

    # Read all files
    file_contents: list[bytes] = []
    total_size = 0

    for filename in merge_request.input_filenames:
        file_path = files_folder / filename

        if not file_path.exists():
            msg = f"File not found: {filename}"
            raise FileNotFoundError(msg)

        content = file_path.read_bytes()
        file_contents.append(content)
        total_size += len(content)

    # Merge PDFs using platform handler
    merged_bytes = platform_handler.merge_pdfs(file_contents)

    # Save merged file
    output_path = files_folder / merge_request.output_filename
    output_path.write_bytes(merged_bytes)

    return MergeResult(
        output_filename=merge_request.output_filename,
        input_files=merge_request.input_filenames,
        input_count=len(merge_request.input_filenames),
        total_input_size_bytes=total_size,
        output_size_bytes=len(merged_bytes),
    )


def register_transformation_tool(mcp: FastMCP) -> None:
    """Register transformation tools with the MCP server"""
    mcp.tool()(merge_files)
