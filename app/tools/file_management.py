# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""File management tools for MCP server"""

from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from app.context import CoreContext, get_dep
from app.handlers import search_folder_in_home

if TYPE_CHECKING:
    from mcp.server.fastmcp import FastMCP

type FileType = Literal["pdf"]


class FileInfo(BaseModel):
    """Information about a single file"""

    name: str = Field(description="File name")
    file_type: str = Field(description="File extension/type")
    size_bytes: int = Field(description="File size in bytes")
    modified_time: datetime = Field(description="Last modification time, ISO format, UTC timezone")


class FileListResult(BaseModel):
    """Result of listing files in the workspace folder"""

    files: list[FileInfo] = Field(description="List of files found")
    total_count: int = Field(description="Total number of files found")
    requested_file_type: FileType | None = Field(
        description="File type filter that was requested (None means all files)"
    )


def list_files(
    ctx: CoreContext,
    file_type: FileType | None = "pdf",
    folder: str | None = None,
) -> FileListResult:
    """List files available for processing.

    Important: If the user mentions a folder/location (e.g., 'Downloads', 'Documents',
    '/path/to/folder'), you MUST pass it as the folder parameter. This sets the workspace
    for all subsequent operations in this session.

    Args:
        file_type: Type of files to list ('pdf' or None for all files)
        folder: Folder name (e.g., 'Downloads') or full path. When specified, this becomes
                the new workspace for all subsequent operations. If not specified, uses the
                current workspace (if any).
    """
    files_handler = get_dep(ctx, "files-handler")

    # If folder is specified, set workspace from it
    if folder is not None:
        folder_path = Path(folder)

        # Handle paths like "Desktop/subfolder" or just "Downloads"
        if not folder_path.is_absolute():
            # Check if first part is a common folder
            first_part = str(folder_path.parts[0])
            found = search_folder_in_home(first_part)

            if found:
                # Reconstruct path with remaining parts
                if len(folder_path.parts) > 1:
                    remaining = folder_path.parts[1:]
                    folder_path = found.joinpath(*remaining)
                else:
                    folder_path = found
            else:
                # Try to resolve as ~/folder or ~/folder/subfolder
                folder_path = Path.home() / folder_path

        # Resolve to absolute path and validate it exists
        folder_path = folder_path.resolve()

        if not folder_path.exists():
            msg = f"Folder not found: {folder_path}"
            raise ValueError(msg)

        if not folder_path.is_dir():
            msg = f"Path is not a directory: {folder_path}"
            raise ValueError(msg)

        # Set workspace
        files_handler.set_workspace(folder_path)

    file_paths = files_handler.list_files(file_type)
    file_paths.sort(key=lambda x: x.stat().st_mtime, reverse=True)

    file_infos: list[FileInfo] = []
    for file_path in file_paths:
        stat = file_path.stat()
        file_infos.append(
            FileInfo(
                name=file_path.name,
                file_type=file_path.suffix.lstrip(".") or "unknown",
                size_bytes=stat.st_size,
                modified_time=datetime.fromtimestamp(stat.st_mtime, tz=UTC),
            )
        )

    return FileListResult(
        files=file_infos,
        total_count=len(file_infos),
        requested_file_type=file_type,
    )


def register_file_management_tool(mcp: FastMCP) -> None:
    """Register file management tools with the MCP server"""
    mcp.tool()(list_files)
