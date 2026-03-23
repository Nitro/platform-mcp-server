# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Pytest fixtures for testing"""

# pylint: disable=redefined-outer-name,protected-access

import contextlib
from typing import TYPE_CHECKING

import pytest
from mcp.server.fastmcp.server import lifespan_wrapper
from mcp.shared.memory import create_connected_server_and_client_session

from app.client import PlatformHandler
from app.config.settings import Settings
from app.context import AppContext
from app.server import mcp

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator
    from pathlib import Path
    from unittest.mock import MagicMock

    from mcp import ClientSession
    from mcp.server.fastmcp import FastMCP
    from pytest_mock import MockerFixture


@pytest.fixture
def temp_workspace(tmp_path: Path) -> Path:
    """Temporary workspace folder."""
    workspace = tmp_path / "test_workspace"
    workspace.mkdir()
    return workspace


@pytest.fixture(name="pdf_a")
def _pdf_a(temp_workspace: Path) -> str:
    """PDF file a.pdf in the workspace."""
    (temp_workspace / "a.pdf").write_bytes(b"pdf-a-content")
    return "a.pdf"


@pytest.fixture(name="pdf_b")
def _pdf_b(temp_workspace: Path) -> str:
    """PDF file b.pdf in the workspace."""
    (temp_workspace / "b.pdf").write_bytes(b"pdf-b-content")
    return "b.pdf"


@pytest.fixture
def mock_settings(temp_workspace: Path, monkeypatch: pytest.MonkeyPatch) -> Settings:
    """Settings backed by a temporary workspace."""
    monkeypatch.setenv("NITRO_AUTH_TOKEN", "test-token-123")
    monkeypatch.setenv("PLATFORM_API_URL", "https://test-api.example.com")
    monkeypatch.setenv("NITRO_MCP_WORKSPACE", str(temp_workspace))
    monkeypatch.setenv("MCP_SERVER_VERSION", "0.0.0-test")
    return Settings()


@pytest.fixture(name="platform_handler_mock")
def _platform_handler_mock(mocker: MockerFixture) -> MagicMock:
    return mocker.create_autospec(PlatformHandler)


@pytest.fixture(name="app_context")
def _app_context(platform_handler_mock: MagicMock, temp_workspace: Path) -> AppContext:
    return AppContext(platform_handler=platform_handler_mock, files_folder=temp_workspace)


class _FixedLifespan:  # pylint: disable=too-few-public-methods
    """Lifespan that yields a fixed AppContext for tests."""

    def __init__(self, app_context: AppContext) -> None:
        self._app_context = app_context

    @contextlib.asynccontextmanager
    async def __call__(self, _: FastMCP) -> AsyncGenerator[AppContext]:
        yield self._app_context


@pytest.fixture(name="client")
async def client(
    monkeypatch: pytest.MonkeyPatch, app_context: AppContext
) -> AsyncGenerator[ClientSession]:
    """MCP client connected to the server with test AppContext injected."""
    monkeypatch.setattr(
        mcp._mcp_server,  # pyright: ignore[reportPrivateUsage]
        "lifespan",
        lifespan_wrapper(mcp, _FixedLifespan(app_context)),
    )

    async with create_connected_server_and_client_session(mcp) as client:
        yield client
