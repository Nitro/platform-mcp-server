# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""File management tools for MCP server"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from app.context import CoreContext, get_dep

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
    folder_path: str = Field(description="Path to the workspace folder")


def list_files(ctx: CoreContext, file_type: FileType | None = "pdf") -> FileListResult:
    """List files available for processing in the configured workspace folder, pass
    file_type=None to list all files regardless of type"""
    files_handler = get_dep(ctx, "files-handler")

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
        folder_path=str(files_handler.root_path),
    )


def register_file_management_tool(mcp: FastMCP) -> None:
    """Register file management tools with the MCP server"""
    mcp.tool()(list_files)
