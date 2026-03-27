# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Configuration settings for the MCP server"""

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Server configuration"""

    # API Configuration
    auth_token: str = Field(
        default="",
        description="Nitro Platform API authentication token",
        validation_alias="NITRO_AUTH_TOKEN",
    )
    auth_url: str = Field(
        default="https://account.gonitro.com",
        description="Nitro authorization server URL",
        validation_alias="NITRO_AUTH_URL",
    )
    api_url: str = Field(
        default="https://api.gonitrodev.com/idp/platform",
        description="Platform API base URL",
        validation_alias="PLATFORM_API_URL",
    )

    # Files Configuration
    files_folder: Path = Field(
        default_factory=lambda: Path.home() / "nitro_mcp_workspace",
        description="Folder for input/output files",
        validation_alias="NITRO_MCP_WORKSPACE",
    )

    # Server Metadata
    version: str = Field(
        default="0.0.0-dev",
        description="Server version",
        validation_alias="MCP_SERVER_VERSION",
    )

    def model_post_init(self, _: object, /) -> None:
        """Ensure files folder exists"""
        self.files_folder.mkdir(parents=True, exist_ok=True)


settings = Settings()
