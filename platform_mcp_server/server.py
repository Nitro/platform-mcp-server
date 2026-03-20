# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""MCP server for Nitro Document Intelligence Platform"""

from mcp.server.fastmcp import FastMCP

from platform_mcp_server.config.settings import settings
from platform_mcp_server.tools.file_management import register_file_management_tools

mcp = FastMCP("Nitro MCP")

# Register tools
register_file_management_tools(mcp)


@mcp.resource("nitro://welcome")
def welcome_message() -> str:
    """Welcome message with server info"""
    return f"""# Nitro MCP

Version: {settings.version}
Workspace folder: {settings.files_folder}

PDF processing tools powered by Nitro's Document Intelligence Platform.
Tools will be added in upcoming releases.
"""


def main() -> None:
    """Entry point for the MCP server"""
    # Validate required configuration
    if not settings.auth_token:
        msg = "NITRO_AUTH_TOKEN environment variable is required"
        raise ValueError(msg)

    mcp.run()


if __name__ == "__main__":
    main()
