# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Shared Pydantic models for MCP tool requests and responses"""

from pathlib import Path

from pydantic import BaseModel, Field


class SingleFileInputBase(BaseModel):
    """Base model for tool requests that operate on a single input file."""

    input_path: Path = Field(
        description=(
            "Full path to the source file (e.g., '~/Downloads/file.pdf' or "
            "'/home/user/Documents/file.pdf'). Must include the directory — bare filenames "
            "are not accepted."
        )
    )


class SingleFileOutputBase(BaseModel):
    """Base model for tool responses that produce a single output file."""

    output_filename: str = Field(description="Filename of the output file in the workspace")


class BoundingBoxArea(BaseModel):
    """Base class for areas with page index and bounding box coordinates"""

    page_index: int = Field(alias="pageIndex", description="Page number (0-indexed)", ge=0)
    bounding_box: list[float] = Field(
        alias="boundingBox",
        description="Bounding box coordinates [x0, y0, width, height]",
        min_length=4,
        max_length=4,
    )

    model_config = {"populate_by_name": True}
