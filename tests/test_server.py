# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for MCP server"""

from typing import TYPE_CHECKING

import pytest

from platform_mcp_server import server
from platform_mcp_server.config.settings import Settings
from platform_mcp_server.server import mcp, welcome_message

if TYPE_CHECKING:
    from pathlib import Path


def test_mcp_server_name() -> None:
    """Test that MCP server has correct name"""
    assert mcp.name == "Nitro MCP"


def test_welcome_message_contains_version(
    mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test that welcome message contains version info"""
    monkeypatch.setattr(server, "settings", mock_settings)

    message = welcome_message()
    assert "Nitro MCP" in message
    assert mock_settings.version in message


def test_welcome_message_contains_workspace(
    mock_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test that welcome message contains workspace path"""
    monkeypatch.setattr(server, "settings", mock_settings)

    message = welcome_message()
    assert str(mock_settings.files_folder) in message


def test_welcome_message_is_markdown() -> None:
    """Test that welcome message is formatted as markdown"""
    message = welcome_message()
    assert message.startswith("# Nitro MCP")


def test_main_requires_auth_token(temp_workspace: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that main() raises error when auth token is not set"""
    # Create settings without auth_token
    monkeypatch.delenv("NITRO_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("NITRO_MCP_WORKSPACE", str(temp_workspace))
    empty_settings = Settings()

    monkeypatch.setattr(server, "settings", empty_settings)

    with pytest.raises(ValueError, match="NITRO_AUTH_TOKEN environment variable is required"):
        server.main()
