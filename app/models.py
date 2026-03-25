# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Shared Pydantic models for MCP tool responses"""

from pydantic import BaseModel, Field


class SingleFileOutputBase(BaseModel):
    """Base model for tool responses that produce a single output file."""

    output_filename: str = Field(description="Filename of the output file in the workspace")
