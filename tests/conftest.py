# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Pytest fixtures for testing"""

# pylint: disable=redefined-outer-name,protected-access

import contextlib
from collections.abc import AsyncGenerator, Callable
from unittest.mock import MagicMock

import pytest
from mcp import ClientSession
from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.server import lifespan_wrapper
from mcp.shared.memory import create_connected_server_and_client_session
from pytest_mock import MockerFixture

from app.config.settings import Settings
from app.context import AppContext
from app.handlers import FilesHandler, PlatformHandler
from app.server import mcp

from .tool_caller import ToolCaller


@pytest.fixture
def mock_settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    """Settings with test configuration."""
    monkeypatch.setenv("NITRO_AUTH_MODE", "token-auth")
    monkeypatch.setenv("NITRO_TARGET_ENV", "dev")
    monkeypatch.setenv("NITRO_AUTH_TOKEN", "test-token-123")
    monkeypatch.setenv("MCP_SERVER_VERSION", "0.0.0-test")
    return Settings()


@pytest.fixture(name="platform_handler_mock")
def _platform_handler_mock(mocker: MockerFixture) -> MagicMock:
    return mocker.create_autospec(PlatformHandler, instance=True, spec_set=True)


@pytest.fixture(name="files_handler_mock")
def _files_handler_mock(mocker: MockerFixture) -> MagicMock:
    return mocker.create_autospec(FilesHandler, instance=True, spec_set=True)


@pytest.fixture(name="app_context")
def _app_context(platform_handler_mock: MagicMock, files_handler_mock: MagicMock) -> AppContext:
    return AppContext(platform_handler=platform_handler_mock, files_handler=files_handler_mock)


def _fixed_lifespan(
    app_context: AppContext,
) -> Callable[[FastMCP], contextlib.AbstractAsyncContextManager[AppContext]]:
    @contextlib.asynccontextmanager
    async def _lifespan(_: FastMCP) -> AsyncGenerator[AppContext]:
        yield app_context

    return _lifespan


@pytest.fixture(name="client")
async def client(
    monkeypatch: pytest.MonkeyPatch, app_context: AppContext
) -> AsyncGenerator[ClientSession]:
    """MCP client connected to the server with test AppContext injected."""
    monkeypatch.setattr(
        mcp._mcp_server,  # pyright: ignore[reportPrivateUsage]
        "lifespan",
        lifespan_wrapper(mcp, _fixed_lifespan(app_context)),
    )

    async with create_connected_server_and_client_session(mcp) as client:
        yield client


@pytest.fixture(name="tool_caller")
async def tool_caller(client: ClientSession) -> ToolCaller:
    """Helper to call tools in tests."""
    return ToolCaller(client)
