# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for MCP server"""

from typing import TYPE_CHECKING

import pytest

from app import server
from app.config.settings import Settings
from app.server import mcp, welcome_message

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


def test_settings_auth_token_raises_when_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test that accessing auth_token raises when NITRO_AUTH_TOKEN is not set"""
    monkeypatch.delenv("NITRO_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("NITRO_MCP_WORKSPACE", str(tmp_path))
    empty_settings = Settings()

    with pytest.raises(ValueError, match="NITRO_AUTH_TOKEN"):
        _ = empty_settings.auth_token
