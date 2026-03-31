# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for configuration settings"""

from pathlib import Path

import pytest

from app.config.settings import Settings


def test_settings_loads_from_environment(mock_settings: Settings) -> None:
    """Test that settings load correctly from environment variables"""
    assert mock_settings.auth_token == "test-token-123"
    assert mock_settings.api_url == "https://api.gonitrodev.com/idp/platform"
    assert mock_settings.version == "0.0.0-test"


def test_settings_uses_default_api_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that default API URL is derived from target_env and auth_mode"""
    monkeypatch.setenv("NITRO_AUTH_MODE", "token-auth")
    monkeypatch.setenv("NITRO_TARGET_ENV", "dev")
    monkeypatch.setenv("NITRO_MCP_WORKSPACE", str(tmp_path))

    settings = Settings()
    assert settings.api_url == "https://api.gonitrodev.com/idp/platform"


def test_settings_auth_token_raises_when_not_set(monkeypatch: pytest.MonkeyPatch) -> None:
    """Test that auth_token raises ValueError when not provided"""
    monkeypatch.setenv("NITRO_AUTH_MODE", "token-auth")
    monkeypatch.delenv("NITRO_AUTH_TOKEN", raising=False)

    settings = Settings()
    with pytest.raises(ValueError, match="NITRO_AUTH_TOKEN"):
        _ = settings.auth_token
