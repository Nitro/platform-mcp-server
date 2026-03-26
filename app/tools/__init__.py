# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""MCP tools for PDF processing"""

from mcp.server.fastmcp import FastMCP

from .conversions import ConversionRequest, ConversionResult, register_conversion_tool
from .extractions import PDFMetadataRequest, register_extraction_tools
from .file_management import FileInfo, FileListResult, register_file_management_tool
from .transformations import MergeRequest, MergeResult, register_transformation_tools


def register(mcp: FastMCP) -> None:
    """Register all tools with the MCP server"""
    register_transformation_tools(mcp)
    register_file_management_tool(mcp)
    register_conversion_tool(mcp)
    register_extraction_tools(mcp)


__all__ = [
    "ConversionRequest",
    "ConversionResult",
    "FileInfo",
    "FileListResult",
    "MergeRequest",
    "MergeResult",
    "PDFMetadataRequest",
    "register",
]
