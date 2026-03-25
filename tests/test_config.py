# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for configuration settings"""

from pathlib import Path
from typing import TYPE_CHECKING

from app.config.settings import Settings

if TYPE_CHECKING:
    import pytest


def test_settings_loads_from_environment(mock_settings: Settings) -> None:
    """Test that settings load correctly from environment variables"""
    assert mock_settings.auth_token == "test-token-123"
    assert mock_settings.api_url == "https://test-api.example.com"
    assert mock_settings.version == "0.0.0-test"


def test_settings_creates_workspace_folder(mock_settings: Settings) -> None:
    """Test that workspace folder is created on initialization"""
    assert mock_settings.files_folder.exists()
    assert mock_settings.files_folder.is_dir()


def test_settings_uses_default_api_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that default API URL is used when not specified"""
    monkeypatch.setenv("NITRO_AUTH_TOKEN", "test-token")
    monkeypatch.setenv("NITRO_MCP_WORKSPACE", str(tmp_path))

    settings = Settings()
    assert settings.api_url == "https://api.gonitrodev.com/idp/platform"


def test_settings_auth_token_defaults_to_empty(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Test that auth token defaults to empty string when not provided"""
    monkeypatch.delenv("NITRO_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("NITRO_MCP_WORKSPACE", str(tmp_path))

    settings = Settings()
    assert settings.auth_token == ""


def test_settings_workspace_is_path(mock_settings: Settings) -> None:
    """Test that workspace folder is a Path object"""
    assert isinstance(mock_settings.files_folder, Path)
