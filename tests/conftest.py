# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Pytest fixtures for testing"""

# pylint: disable=redefined-outer-name,protected-access

import contextlib
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from mcp.server.fastmcp.server import lifespan_wrapper
from mcp.shared.memory import create_connected_server_and_client_session

from app.config.settings import Settings
from app.context import AppContext
from app.handlers import FilesHandler, PlatformHandler
from app.server import mcp

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator
    from unittest.mock import MagicMock

    from mcp import ClientSession
    from mcp.server.fastmcp import FastMCP
    from pytest_mock import MockerFixture


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
def _files_handler_mock(mocker: MockerFixture, tmp_path: Path) -> MagicMock:
    """Create a FilesHandler mock with workspace already set to tmp_path."""

    # Patch ensure_workspace_from_path to accept bare filenames in tests
    def mock_ensure_workspace(_handler: object, input_path: Path | str) -> Path:
        # In tests, just return the path as-is (treating it as a filename)
        return Path(input_path) if isinstance(input_path, str) else input_path

    # Patch extract_workspace_and_filename for merge_files
    def mock_extract_workspace(input_path: Path | str) -> tuple[Path, Path]:
        # In tests, return tmp_path as workspace and input as filename
        path = Path(input_path) if isinstance(input_path, str) else input_path
        return tmp_path, path

    # Patch in all tool modules
    mocker.patch(
        "app.tools.transformations.ensure_workspace_from_path",
        side_effect=mock_ensure_workspace,
    )
    mocker.patch(
        "app.tools.transformations.extract_workspace_and_filename",
        side_effect=mock_extract_workspace,
    )
    mocker.patch(
        "app.tools.conversions.ensure_workspace_from_path",
        side_effect=mock_ensure_workspace,
    )
    mocker.patch(
        "app.tools.extractions.ensure_workspace_from_path",
        side_effect=mock_ensure_workspace,
    )

    # Create a real FilesHandler with workspace set for tests
    handler = FilesHandler(tmp_path)

    # But mock the read/write/list_files methods
    mock = mocker.create_autospec(FilesHandler, instance=True, spec_set=True)
    # Copy workspace state from real handler
    mock.has_workspace = handler.has_workspace
    mock.workspace = handler.workspace
    mock.set_workspace = mocker.MagicMock()  # Mock set_workspace

    return mock


@pytest.fixture(name="app_context")
def _app_context(platform_handler_mock: MagicMock, files_handler_mock: MagicMock) -> AppContext:
    return AppContext(platform_handler=platform_handler_mock, files_handler=files_handler_mock)


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
