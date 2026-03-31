# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""MCP server for Nitro Document Intelligence Platform"""

import contextlib
from collections.abc import AsyncGenerator

from mcp.server.fastmcp import FastMCP

from app.auth import resolve_token
from app.config import settings
from app.context import AppContext
from app.handlers import FilesHandler, PlatformHandler
from app.tools import register as register_tools

_AUTH_REQUIRED_MSG = (
    "Not authenticated. Please sign in to Nitro by visiting:\n\n"
    "{auth_url}\n\n"
    "Once signed in, retry your request."
)


@contextlib.asynccontextmanager
async def lifespan(_: FastMCP) -> AsyncGenerator[AppContext]:
    """Lifespan handler for MCP server"""
    token = resolve_token(settings.auth_url, settings.client_id) or settings.auth_token
    yield AppContext(
        platform_handler=PlatformHandler.create(settings.api_url, token),
        files_handler=FilesHandler(settings.files_folder),
        auth_url=settings.auth_url,
        client_id=settings.client_id,
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
