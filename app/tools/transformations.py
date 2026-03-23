# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""PDF transformation tools for MCP server"""

from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from app.client.platform_client import PlatformClientWrapper
from app.config import settings

if TYPE_CHECKING:
    from mcp.server.fastmcp import FastMCP


class MergeResult(BaseModel):
    """Result of merging PDF files"""

    output_filename: str = Field(description="Name of the merged output file")
    input_files: list[str] = Field(description="List of input filenames that were merged")
    input_count: int = Field(description="Number of files merged")
    total_input_size_bytes: int = Field(description="Total size of input files in bytes")
    output_size_bytes: int = Field(description="Size of merged output file in bytes")


def merge_files(
    filenames: list[str],
    output_name: str = "merged.pdf",
) -> MergeResult:
    """
    Merge multiple PDF files from the workspace into one PDF.

    Args:
        filenames: List of PDF filenames to merge (in order)
        output_name: Name for the merged PDF file

    Returns:
        MergeResult with details about the merge operation

    Raises:
        ValueError: If filenames list is invalid
        FileNotFoundError: If any input file doesn't exist
        RuntimeError: If merge operation fails
    """
    if not filenames:
        msg = "At least one filename is required for merging"
        raise ValueError(msg)

    if len(filenames) < 2:
        msg = "At least two files are required for merging"
        raise ValueError(msg)

    files_folder = settings.files_folder

    # Read all files
    file_contents: list[bytes] = []
    total_size = 0

    for filename in filenames:
        file_path = files_folder / filename

        if not file_path.exists():
            msg = f"File not found: {filename}"
            raise FileNotFoundError(msg)

        content = file_path.read_bytes()
        file_contents.append(content)
        total_size += len(content)

    # Merge PDFs using platform client
    client = PlatformClientWrapper(settings.api_url, settings.auth_token)
    try:
        merged_bytes = client.merge_pdfs(file_contents, filenames)
    finally:
        client.close()

    # Ensure output filename has .pdf extension
    if not output_name.lower().endswith(".pdf"):
        output_name = f"{output_name}.pdf"

    # Save merged file
    output_path = files_folder / output_name
    output_path.write_bytes(merged_bytes)

    return MergeResult(
        output_filename=output_name,
        input_files=filenames,
        input_count=len(filenames),
        total_input_size_bytes=total_size,
        output_size_bytes=len(merged_bytes),
    )


def register_transformation_tools(mcp: FastMCP) -> None:
    """Register transformation tools with the MCP server"""
    mcp.tool()(merge_files)
