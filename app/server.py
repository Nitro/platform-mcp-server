# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""MCP server for Nitro Document Intelligence Platform"""

import contextlib
from collections.abc import AsyncGenerator

from mcp.server.fastmcp import FastMCP

from app.config import settings
from app.context import AppContext
from app.handlers import FilesHandler, PlatformHandler
from app.tools import register as register_tools


@contextlib.asynccontextmanager
async def lifespan(_: FastMCP) -> AsyncGenerator[AppContext]:
    """Lifespan handler for MCP server"""
    if settings.auth_mode == "token-auth":
        platform_handler = PlatformHandler.from_auth_token(settings.api_url, settings.auth_token)
    else:
        platform_handler = PlatformHandler.from_client_credentials(
            settings.api_url, settings.client_credentials
        )
    yield AppContext(
        platform_handler=platform_handler,
        files_handler=FilesHandler(settings.files_folder),
    )


mcp = FastMCP("Nitro MCP", lifespan=lifespan)

# Register tools
register_tools(mcp)


@mcp.resource("nitro://welcome")
def welcome_message() -> str:
    """Welcome message with server info"""
    return (
        f"# Nitro MCP\n\n"
        f"Version: {settings.version}\n"
        f"Workspace folder: {settings.files_folder}\n\n"
        "PDF processing tools powered by Nitro's Document Intelligence Platform.\n"
        "Tools will be added in upcoming releases.\n"
    )


def main() -> None:
    """Entry point for the MCP server"""
    mcp.run()


if __name__ == "__main__":
    main()
