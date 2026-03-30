# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Configuration settings for the MCP server"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings


class EnvVars(BaseSettings):
    """Raw environment variable bindings — all optional at read time."""

    target_env: Literal["dev", "prod"] = Field(default="dev", validation_alias="NITRO_TARGET_ENV")
    auth_mode: Literal["token-auth", "client-credentials"] = Field(
        default="token-auth", validation_alias="NITRO_AUTH_MODE"
    )
    auth_token: str | None = Field(default=None, validation_alias="NITRO_AUTH_TOKEN")
    client_id: str | None = Field(default=None, validation_alias="NITRO_CLIENT_ID")
    client_secret: str | None = Field(default=None, validation_alias="NITRO_CLIENT_SECRET")
    files_folder: Path = Field(
        default_factory=lambda: Path.home() / "nitro_mcp_workspace",
        validation_alias="NITRO_MCP_WORKSPACE",
    )
    version: str = Field(default="0.0.0-dev", validation_alias="MCP_SERVER_VERSION")


@dataclass(slots=True)
class Settings:
    """Typed settings with lazy validation of credential fields."""

    _env: EnvVars = field(default_factory=EnvVars)

    @property
    def target_env(self) -> Literal["dev", "prod"]:
        """Deployment environment: 'dev' or 'prod'."""
        return self._env.target_env

    @property
    def auth_mode(self) -> Literal["token-auth", "client-credentials"]:
        """Authentication mode: 'token-auth' or 'client-credentials'."""
        return self._env.auth_mode

    @property
    def auth_token(self) -> str:
        """Bearer token. Raises ValueError if NITRO_AUTH_TOKEN is not set."""
        if self._env.auth_token is None:
            msg = "NITRO_AUTH_TOKEN is required when auth_mode is 'token-auth'"
            raise ValueError(msg)
        return self._env.auth_token

    @property
    def client_credentials(self) -> tuple[str, str]:
        """Client ID and secret. Raises ValueError if either is not set."""
        if self._env.client_id is None or self._env.client_secret is None:
            msg = (
                "NITRO_CLIENT_ID and NITRO_CLIENT_SECRET are required"
                " when auth_mode is 'client-credentials'"
            )
            raise ValueError(msg)
        return self._env.client_id, self._env.client_secret

    @property
    def api_url(self) -> str:
        """Platform API URL derived from target_env and auth_mode."""
        return {
            ("dev", "token-auth"): "https://api.gonitrodev.com/idp/platform",
            ("dev", "client-credentials"): "https://public-api.gonitrodev.com",
            ("prod", "token-auth"): "https://api.gonitro.com/idp/platform",
            ("prod", "client-credentials"): "https://api.gonitro.dev",
        }[(self._env.target_env, self._env.auth_mode)]

    @property
    def files_folder(self) -> Path:
        """Workspace folder for input/output files."""
        self._env.files_folder.mkdir(parents=True, exist_ok=True)
        return self._env.files_folder

    @property
    def version(self) -> str:
        """Server version string."""
        return self._env.version


settings = Settings()
