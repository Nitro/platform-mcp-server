# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""PDF transformation tools for MCP server"""

from pathlib import Path  # noqa: TC003
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from app.client import PlatformHandler
from app.config import settings

if TYPE_CHECKING:
    from mcp.server.fastmcp import FastMCP


class MergeRequest(BaseModel):
    """Request to merge multiple files into one"""

    input_paths: list[Path] = Field(
        min_length=2,
        description="Absolute paths of the files to merge. Must be at least 2 files.",
    )
    output_path: Path = Field(
        description="Absolute path for the merged output file, including filename and extension.",
    )


class MergeResult(BaseModel):
    """Result of merging PDF files"""

    output_filename: str = Field(description="Name of the merged output file")
    input_files: list[str] = Field(description="List of input filenames that were merged")
    input_count: int = Field(description="Number of files merged")
    total_input_size_bytes: int = Field(description="Total size of input files in bytes")
    output_size_bytes: int = Field(description="Size of merged output file in bytes")


def merge_files(merge_request: MergeRequest) -> MergeResult:
    """
    Merge multiple PDF files from the workspace into one PDF.

    Args:
        merge_request: Request containing input paths and output path

    Returns:
        MergeResult with details about the merge operation

    Raises:
        FileNotFoundError: If any input file doesn't exist
        RuntimeError: If merge operation fails
    """
    # Read all files
    file_contents: list[bytes] = []
    total_size = 0

    for file_path in merge_request.input_paths:
        if not file_path.exists():
            msg = f"File not found: {file_path}"
            raise FileNotFoundError(msg)

        content = file_path.read_bytes()
        file_contents.append(content)
        total_size += len(content)

    # Merge PDFs using platform handler
    handler = PlatformHandler.create(settings.api_url, settings.auth_token)
    merged_bytes = handler.merge_pdfs(file_contents)

    # Save merged file
    merge_request.output_path.write_bytes(merged_bytes)

    return MergeResult(
        output_filename=merge_request.output_path.name,
        input_files=[p.name for p in merge_request.input_paths],
        input_count=len(merge_request.input_paths),
        total_input_size_bytes=total_size,
        output_size_bytes=len(merged_bytes),
    )


def register_transformation_tools(mcp: FastMCP) -> None:
    """Register transformation tools with the MCP server"""
    mcp.tool()(merge_files)
