# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""File management tools for MCP server"""

from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from app.context import CoreContext, get_dep

if TYPE_CHECKING:
    from mcp.server.fastmcp import FastMCP


class FileInfo(BaseModel):
    """Information about a single file"""

    name: str = Field(description="File name")
    size_mb: float = Field(description="File size in megabytes")
    modified_time: float = Field(description="Last modification time (Unix timestamp)")


class FileListResult(BaseModel):
    """Result of listing files in the workspace folder"""

    files: list[FileInfo] = Field(description="List of files found")
    total_count: int = Field(description="Total number of files found")
    file_type: str = Field(description="Type of files listed (pdf, all)")
    folder_path: str = Field(description="Path to the workspace folder")


def list_files(ctx: CoreContext, file_type: str = "pdf") -> FileListResult:
    """
    List files available for processing in the configured workspace folder.

    Args:
        file_type: Type of files to list (pdf, all)

    Returns:
        FileListResult with list of files and metadata

    Raises:
        FileNotFoundError: If workspace folder does not exist
    """
    files_folder = get_dep(ctx, "files-folder")

    if not files_folder.exists():
        msg = f"Workspace folder does not exist: {files_folder}"
        raise FileNotFoundError(msg)

    # Get files based on type
    if file_type.lower() == "pdf":
        files = list(files_folder.glob("*.pdf"))
    else:
        files = [f for f in files_folder.iterdir() if f.is_file()]

    # Sort by modification time (newest first)
    files.sort(key=lambda x: x.stat().st_mtime, reverse=True)

    # Build file info list
    file_infos: list[FileInfo] = []
    for file_path in files:
        stat = file_path.stat()
        file_infos.append(
            FileInfo(
                name=file_path.name,
                size_mb=stat.st_size / (1024 * 1024),
                modified_time=stat.st_mtime,
            )
        )

    return FileListResult(
        files=file_infos,
        total_count=len(file_infos),
        file_type=file_type,
        folder_path=str(files_folder),
    )


def register_file_management_tools(mcp: FastMCP) -> None:
    """Register file management tools with the MCP server"""
    mcp.tool()(list_files)
