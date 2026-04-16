# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""File management tools for MCP server"""

from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field

from app.context import CoreContext, get_dep

type FileType = Literal["pdf"]


class FileInfo(BaseModel):
    """Information about a single file"""

    path: str = Field(description="Full path to the file — use this as input_path for other tools")
    file_type: str = Field(description="File extension/type")
    size_bytes: int = Field(description="File size in bytes")
    modified_time: datetime = Field(description="Last modification time, ISO format, UTC timezone")


class FileListResult(BaseModel):
    """Result of listing files in the folder"""

    files: list[FileInfo] = Field(description="List of files found")
    total_count: int = Field(description="Total number of files found")
    requested_file_type: FileType | None = Field(
        description="File type filter that was requested (None means all files)"
    )


class ListFilesRequest(BaseModel):
    """Request model for listing files in a folder."""

    file_type: FileType | None = Field(
        None, description="Type of files to list ('pdf' or None for all files)"
    )
    folder: Path = Field(
        description=(
            "Full path to the folder to list files from (e.g., '~/Downloads' or "
            "'/home/user/Documents'). You may also provide a bare folder name like 'Downloads' "
            "and it will be resolved from the home directory. If you are unsure of the full path, "
            "ask the user to provide it."
        ),
    )


def _search_folder_in_home(name: str) -> Path | None:
    """Search for a folder by name in the home directory (case-insensitive)."""
    home = Path.home()
    name_lower = name.lower()
    for child in home.iterdir():
        if child.is_dir() and child.name.lower() == name_lower:
            return child
    return None


def _resolve_folder(folder: Path) -> Path:
    """Resolve a folder path, supporting bare folder names via home directory lookup."""
    if not folder.is_absolute() and not str(folder).startswith("~"):
        first_part = folder.parts[0]
        found = _search_folder_in_home(first_part)
        if found is not None:
            rest = Path(*folder.parts[1:]) if len(folder.parts) > 1 else Path()
            return (found / rest).resolve() if rest != Path() else found
    return folder.expanduser().resolve()


def list_files(ctx: CoreContext, request: ListFilesRequest) -> FileListResult:
    """List files available for processing"""
    files_handler = get_dep(ctx, "files-handler")

    folder = _resolve_folder(request.folder)
    file_paths = files_handler.list_files(folder, request.file_type)

    file_paths_with_stat = [(f, f.stat()) for f in file_paths]
    file_paths_with_stat.sort(key=lambda x: x[1].st_mtime, reverse=True)

    file_infos: list[FileInfo] = []
    for file_path, stat in file_paths_with_stat:
        file_infos.append(
            FileInfo(
                path=str(file_path),
                file_type=file_path.suffix.lstrip(".") or "unknown",
                size_bytes=stat.st_size,
                modified_time=datetime.fromtimestamp(stat.st_mtime, tz=UTC),
            )
        )

    return FileListResult(
        files=file_infos, total_count=len(file_infos), requested_file_type=request.file_type
    )


def register(mcp: FastMCP) -> None:
    """Register file management tools with the MCP server"""
    mcp.tool(
        description="Use this tool to list files available in the workspace for processing.",
        annotations=ToolAnnotations(readOnlyHint=True),
    )(list_files)
