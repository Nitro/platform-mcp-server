# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved
# pylint: disable=redefined-outer-name

"""Pytest fixtures for testing"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from platform_mcp_server.config.settings import Settings

if TYPE_CHECKING:
    from pathlib import Path


@pytest.fixture
def temp_workspace(tmp_path: Path) -> Path:
    """Create a temporary workspace folder for tests"""
    workspace = tmp_path / "test_workspace"
    workspace.mkdir()
    return workspace


@pytest.fixture
def mock_settings(temp_workspace: Path, monkeypatch: pytest.MonkeyPatch) -> Settings:
    """Create test settings with temporary workspace"""
    monkeypatch.setenv("NITRO_AUTH_TOKEN", "test-token-123")
    monkeypatch.setenv("PLATFORM_API_URL", "https://test-api.example.com")
    monkeypatch.setenv("NITRO_MCP_WORKSPACE", str(temp_workspace))
    monkeypatch.setenv("MCP_SERVER_VERSION", "0.0.0-test")

    # Force reload settings with test environment variables
    return Settings()
