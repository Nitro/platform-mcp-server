# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Shared Pydantic models for MCP tool requests and responses"""

from pathlib import Path

from pydantic import BaseModel, Field


class SingleFileInputBase(BaseModel):
    """Base model for tool requests that operate on a single input file."""

    input_filename: Path = Field(description="Filename of the source file in the workspace")


class SingleFileOutputBase(BaseModel):
    """Base model for tool responses that produce a single output file."""

    output_filename: str = Field(description="Filename of the output file in the workspace")
