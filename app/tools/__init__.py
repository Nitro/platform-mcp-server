# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""MCP tools for PDF processing"""

from mcp.server.fastmcp import FastMCP

from app.tools.file_management import (
    FileInfo,
    FileListResult,
    register_file_management_tools,
)
from app.tools.transformations import (
    MergeRequest,
    MergeResult,
    register_transformation_tools,
)


def register(mcp: FastMCP) -> None:
    """Register all tools with the MCP server"""
    register_transformation_tools(mcp)
    register_file_management_tools(mcp)


__all__ = [
    "FileInfo",
    "FileListResult",
    "MergeRequest",
    "MergeResult",
    "register",
]
