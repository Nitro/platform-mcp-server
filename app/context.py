# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""App context and dependency injection for MCP tools."""

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, overload

from mcp.server.fastmcp import Context
from mcp.server.session import ServerSession

from app.auth import resolve_token, start_auth_flow

if TYPE_CHECKING:
    from app.handlers import FilesHandler, PlatformHandler


@dataclass(slots=True)
class AppContext:
    """Lifespan context injected into every tool call."""

    platform_handler: PlatformHandler
    files_handler: FilesHandler
    auth_url: str
    client_id: str


CoreContext = Context[ServerSession, AppContext]


def _get_app_context(ctx: CoreContext) -> AppContext:
    """Helper function to extract AppContext from CoreContext"""
    return ctx.request_context.lifespan_context


@overload
def get_dep(ctx: CoreContext, thing: Literal["files-handler"]) -> FilesHandler:
    """Get the files handler from the context"""


@overload
def get_dep(ctx: CoreContext, thing: Literal["platform-handler"]) -> PlatformHandler:
    """Get the platform handler from the context"""


def get_dep(
    ctx: CoreContext, thing: Literal["files-handler", "platform-handler"]
) -> FilesHandler | PlatformHandler:
    """Get a dependency from the context by name."""
    if thing == "files-handler":
        return _get_app_context(ctx).files_handler
    return _get_app_context(ctx).platform_handler


def require_auth(ctx: CoreContext) -> str:
    """Return a valid access token, or raise if the user is not authenticated."""
    app_ctx = _get_app_context(ctx)
    token = resolve_token(app_ctx.auth_url, app_ctx.client_id)
    if not token:
        url = start_auth_flow(app_ctx.auth_url, app_ctx.client_id)
        raise PermissionError(
            f"Not authenticated. Please sign in to Nitro by visiting:\n\n{url}\n\nOnce signed in, retry your request. Just tell the user they are not signed in or the session has expired."
        )
    return token
