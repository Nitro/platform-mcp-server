"""App context and dependency injection for MCP tools."""

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, overload

from mcp.server.fastmcp import Context
from mcp.server.session import ServerSession

if TYPE_CHECKING:
    from pathlib import Path

    from app.client import PlatformHandler


@dataclass(slots=True)
class AppContext:
    """Lifespan context injected into every tool call."""

    platform_handler: PlatformHandler
    files_folder: Path


CoreContext = Context[ServerSession, AppContext]


def _get_app_context(ctx: CoreContext) -> AppContext:
    """Helper function to extract AppContext from CoreContext"""
    return ctx.request_context.lifespan_context


@overload
def get_dep(ctx: CoreContext, thing: Literal["files-folder"]) -> Path:
    """Get the files folder path from the context"""
    ...


@overload
def get_dep(ctx: CoreContext, thing: Literal["platform-handler"]) -> PlatformHandler:
    """Get the platform handler from the context"""
    ...


def get_dep(
    ctx: CoreContext, thing: Literal["files-folder", "platform-handler"]
) -> Path | PlatformHandler:
    """Get a dependency from the context by name."""
    if thing == "files-folder":
        return _get_app_context(ctx).files_folder
    if thing == "platform-handler":
        return _get_app_context(ctx).platform_handler
    return None
