# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""File management tools for MCP server"""

from typing import TYPE_CHECKING

from platform_mcp_server.config.settings import settings

if TYPE_CHECKING:
    from mcp.server.fastmcp import FastMCP


def list_files(file_type: str = "pdf") -> str:
    """
    List files available for processing in the configured workspace folder.

    Args:
        file_type: Type of files to list (pdf, all)

    Returns:
        List of available files with details
    """
    files_folder = settings.files_folder

    if not files_folder.exists():
        return f"❌ Workspace folder does not exist: {files_folder}"

    # Get files based on type
    if file_type.lower() == "pdf":
        files = list(files_folder.glob("*.pdf"))
    else:
        files = [f for f in files_folder.iterdir() if f.is_file()]

    if not files:
        return f"No {file_type.upper()} files found in: {files_folder}"

    # Sort by modification time (newest first)
    files.sort(key=lambda x: x.stat().st_mtime, reverse=True)

    result = f"Found {len(files)} {file_type.upper()} file(s):\n\n"

    for i, file_path in enumerate(files, 1):
        stat = file_path.stat()
        size_mb = stat.st_size / (1024 * 1024)
        result += f"{i}. {file_path.name} ({size_mb:.1f} MB)\n"

    return result


def register_file_management_tools(mcp: FastMCP) -> None:
    """Register file management tools with the MCP server"""
    mcp.tool()(list_files)
