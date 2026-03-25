# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""PDF transformation tools for MCP server"""

from pathlib import Path
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from app.client import CompressionLevel
from app.context import CoreContext, get_dep
from app.handlers.platform_handler import PageRotation
from app.models import SingleFileOutputBase

if TYPE_CHECKING:
    from mcp.server.fastmcp import FastMCP


class MergeRequest(BaseModel):
    """Request to merge multiple files into one"""

    input_filenames: list[str] = Field(
        min_length=2,
        description="Filenames to merge from workspace. Must be at least 2 files.",
    )
    output_filename: str = Field(
        default="merged.pdf",
        description="Output filename for the merged file.",
    )


class MergeResult(SingleFileOutputBase):
    """Result of merging PDF files"""

    input_filenames: list[str] = Field(description="List of input filenames that were merged")
    input_count: int = Field(description="Number of files merged")
    total_input_size_bytes: int = Field(description="Total size of input files in bytes")
    output_size_bytes: int = Field(description="Size of merged output file in bytes")


def merge_files(ctx: CoreContext, request: MergeRequest) -> MergeResult:
    """Merge multiple PDF files into one PDF."""
    files_handler = get_dep(ctx, "files-handler")
    platform_handler = get_dep(ctx, "platform-handler")

    file_contents: list[bytes] = []
    total_size = 0

    for filename in request.input_filenames:
        content = files_handler.read(Path(filename))
        file_contents.append(content)
        total_size += len(content)

    merged_bytes = platform_handler.merge_pdfs(file_contents)

    written = files_handler.write(request.output_filename, merged_bytes)

    return MergeResult(
        output_filename=written.name,
        input_filenames=request.input_filenames,
        input_count=len(request.input_filenames),
        total_input_size_bytes=total_size,
        output_size_bytes=len(merged_bytes),
    )


class CompressRequest(BaseModel):
    """Request to compress a PDF file"""

    input_filename: Path = Field(description="Filename of the source PDF in the workspace")
    level: str = Field(
        default="medium",
        description='Compression level: "light", "medium", or "heavy"',
    )


class CompressResult(SingleFileOutputBase):
    """Result of compressing a PDF file"""

    input_filename: str = Field(description="Filename of the source file in the workspace")
    original_size_bytes: int = Field(description="Size of original file in bytes")
    compressed_size_bytes: int = Field(description="Size of compressed file in bytes")
    reduction_percent: float = Field(description="Percentage reduction in file size")


async def compress_file(ctx: CoreContext, request: CompressRequest) -> CompressResult:
    """Compress a PDF file to reduce its size using the specified compression level."""
    files_handler = get_dep(ctx, "files-handler")
    platform_handler = get_dep(ctx, "platform-handler")

    level_map = {
        "light": CompressionLevel.LIGHT,
        "medium": CompressionLevel.MEDIUM,
        "heavy": CompressionLevel.HEAVY,
    }
    level = level_map.get(request.level)
    if level is None:
        msg = f"Invalid compression level: {request.level}. Must be 'light', 'medium', or 'heavy'"
        raise ValueError(msg)

    original_bytes = files_handler.read(request.input_filename)
    original_size = len(original_bytes)

    compressed_bytes = platform_handler.compress_pdf(original_bytes, level)
    compressed_size = len(compressed_bytes)
    reduction = ((original_size - compressed_size) / original_size) * 100

    written = files_handler.write(
        request.input_filename, compressed_bytes, stem_suffix=f"compressed-{request.level}"
    )

    return CompressResult(
        input_filename=str(request.input_filename),
        output_filename=written.name,
        original_size_bytes=original_size,
        compressed_size_bytes=compressed_size,
        reduction_percent=round(reduction, 1),
    )


class SplitRequest(BaseModel):
    """Request to split a PDF by page ranges"""

    input_filename: Path = Field(description="Filename of the source PDF in the workspace")
    page_ranges: list[str] = Field(
        description='Page ranges to split (e.g., ["1-3", "5", "7-9"]). Pages are 1-indexed.',
    )


class SplitResult(SingleFileOutputBase):
    """Result of splitting a PDF file"""

    input_filename: str = Field(description="Filename of the source file in the workspace")
    split_count: int = Field(description="Number of PDF files created")


async def split_pdf(ctx: CoreContext, request: SplitRequest) -> SplitResult:
    """Split a PDF file by page ranges into separate PDFs packaged in a ZIP file."""
    files_handler = get_dep(ctx, "files-handler")
    platform_handler = get_dep(ctx, "platform-handler")

    parsed_ranges: list[list[int]] = []
    for range_str in request.page_ranges:
        range_str = range_str.strip()
        if "-" in range_str:
            start_str, end_str = range_str.split("-", 1)
            parsed_ranges.append(list(range(int(start_str) - 1, int(end_str))))
        else:
            parsed_ranges.append([int(range_str) - 1])

    zip_bytes = platform_handler.split_pdf(
        files_handler.read(request.input_filename), parsed_ranges
    )

    written = files_handler.write(request.input_filename, zip_bytes, stem_suffix="split", ext="zip")

    return SplitResult(
        input_filename=str(request.input_filename),
        output_filename=written.name,
        split_count=len(parsed_ranges),
    )


class Rotation(BaseModel):
    """Represents a page rotation operation"""

    page_number: int = Field(description="Page number to rotate (1-indexed)", ge=1)
    amount: Literal[-270, -180, -90, 90, 180, 270] = Field(description="Rotation amount in degrees")


class RotateRequest(BaseModel):
    """Request to rotate specific pages in a PDF"""

    input_filename: Path = Field(description="Filename of the source PDF in the workspace")
    rotations: list[Rotation] = Field(
        description="List of page rotations to apply. Pages are 1-indexed."
    )


class RotateResult(SingleFileOutputBase):
    """Result of rotating pages in a PDF"""

    input_filename: str = Field(description="Filename of the source file in the workspace")
    rotation_count: int = Field(description="Number of pages rotated")


async def rotate_pdf(ctx: CoreContext, request: RotateRequest) -> RotateResult:
    """Rotate specific pages in a PDF file by specified degrees."""
    files_handler = get_dep(ctx, "files-handler")
    platform_handler = get_dep(ctx, "platform-handler")

    page_rotations: list[PageRotation] = [
        {"pageIndex": rotation.page_number - 1, "amount": rotation.amount}
        for rotation in request.rotations
    ]

    rotated_bytes = platform_handler.rotate_pdf(
        files_handler.read(request.input_filename), page_rotations
    )

    written = files_handler.write(request.input_filename, rotated_bytes, stem_suffix="rotated")

    return RotateResult(
        input_filename=str(request.input_filename),
        output_filename=written.name,
        rotation_count=len(page_rotations),
    )


class ProtectRequest(BaseModel):
    """Request to password-protect a PDF"""

    input_filename: Path = Field(description="Filename of the source PDF in the workspace")
    owner_password: str | None = Field(
        default=None,
        description="Owner password for full access (optional)",
    )
    user_password: str | None = Field(
        default=None,
        description="User password for restricted access (optional)",
    )
    permissions: list[str] | None = Field(
        default=None,
        description=(
            "List of permissions to grant: "
            '["print", "modify", "copy", "annotate", "form", "assemble", "print-hq"]'
        ),
    )


class ProtectResult(SingleFileOutputBase):
    """Result of protecting a PDF"""

    input_filename: str = Field(description="Filename of the source file in the workspace")
    has_owner_password: bool = Field(description="Whether owner password was set")
    has_user_password: bool = Field(description="Whether user password was set")


async def protect_pdf(ctx: CoreContext, request: ProtectRequest) -> ProtectResult:
    """Protect a PDF file with passwords and permissions."""
    files_handler = get_dep(ctx, "files-handler")
    platform_handler = get_dep(ctx, "platform-handler")

    protected_bytes = platform_handler.protect_pdf(
        files_handler.read(request.input_filename),
        owner_password=request.owner_password,
        user_password=request.user_password,
        permissions=request.permissions,
    )

    written = files_handler.write(request.input_filename, protected_bytes, stem_suffix="protected")

    return ProtectResult(
        input_filename=str(request.input_filename),
        output_filename=written.name,
        has_owner_password=request.owner_password is not None,
        has_user_password=request.user_password is not None,
    )


class UnprotectRequest(BaseModel):
    """Request to remove password protection from a PDF"""

    input_filename: Path = Field(description="Filename of the source PDF in the workspace")
    owner_password: str | None = Field(
        default=None,
        description="Owner password to remove protection (optional)",
    )
    user_password: str | None = Field(
        default=None,
        description="User password to remove protection (optional)",
    )


class UnprotectResult(SingleFileOutputBase):
    """Result of removing password protection from a PDF"""

    input_filename: str = Field(description="Filename of the source file in the workspace")


async def unprotect_pdf(ctx: CoreContext, request: UnprotectRequest) -> UnprotectResult:
    """Remove password protection from a PDF file."""
    files_handler = get_dep(ctx, "files-handler")
    platform_handler = get_dep(ctx, "platform-handler")

    unprotected_bytes = platform_handler.unprotect_pdf(
        files_handler.read(request.input_filename),
        owner_password=request.owner_password,
        user_password=request.user_password,
    )

    written = files_handler.write(
        request.input_filename, unprotected_bytes, stem_suffix="unprotected"
    )

    return UnprotectResult(
        input_filename=str(request.input_filename),
        output_filename=written.name,
    )


class DeletePagesRequest(BaseModel):
    """Request to delete specific pages from a PDF"""

    input_filename: Path = Field(description="Filename of the source PDF in the workspace")
    page_numbers: str = Field(
        description='Page numbers to delete (e.g., "1,3,5" or "2,4-6,8"). Pages are 1-indexed.',
    )


class DeletePagesResult(SingleFileOutputBase):
    """Result of deleting pages from a PDF"""

    input_filename: str = Field(description="Filename of the source file in the workspace")
    pages_deleted: int = Field(description="Number of pages deleted")


async def delete_pdf_pages(ctx: CoreContext, request: DeletePagesRequest) -> DeletePagesResult:
    """Delete specific pages from a PDF file."""
    files_handler = get_dep(ctx, "files-handler")
    platform_handler = get_dep(ctx, "platform-handler")

    parsed_pages: list[int] = []
    for page_part in request.page_numbers.split(","):
        page_part = page_part.strip()
        if "-" in page_part:
            start_str, end_str = page_part.split("-", 1)
            start = int(start_str)
            end = int(end_str)
            if start > end:
                msg = f"Invalid page range: {page_part}. Start must be <= end"
                raise ValueError(msg)
            parsed_pages.extend(list(range(start - 1, end)))
        else:
            page_num = int(page_part)
            if page_num <= 0:
                msg = f"Invalid page number: {page_num}. Pages start from 1"
                raise ValueError(msg)
            parsed_pages.append(page_num - 1)

    parsed_pages = sorted(set(parsed_pages))

    modified_bytes = platform_handler.delete_pdf_pages(
        files_handler.read(request.input_filename), parsed_pages
    )

    written = files_handler.write(
        request.input_filename, modified_bytes, stem_suffix="pages-deleted"
    )

    return DeletePagesResult(
        input_filename=str(request.input_filename),
        output_filename=written.name,
        pages_deleted=len(parsed_pages),
    )


class SetMetadataRequest(BaseModel):
    """Request to set PDF metadata"""

    input_filename: Path = Field(description="Filename of the source PDF in the workspace")
    title: str | None = Field(default=None, description="Document title")
    author: str | None = Field(default=None, description="Document author")
    subject: str | None = Field(default=None, description="Document subject")
    keywords: str | None = Field(default=None, description="Document keywords (comma-separated)")
    creator: str | None = Field(default=None, description="Application that created the document")
    producer: str | None = Field(default=None, description="Application that produced the PDF")
    creation_date: str | None = Field(
        default=None, description="Creation date in PDF format 'D:YYYYMMDDhhmmss'"
    )
    mod_date: str | None = Field(
        default=None, description="Modification date in PDF format 'D:YYYYMMDDhhmmss'"
    )
    trapped: str | None = Field(default=None, description="Trapping status")


class SetMetadataResult(SingleFileOutputBase):
    """Result of setting PDF metadata"""

    input_filename: str = Field(description="Filename of the source file in the workspace")
    fields_updated: int = Field(description="Number of metadata fields updated")


async def set_pdf_metadata(ctx: CoreContext, request: SetMetadataRequest) -> SetMetadataResult:
    """Set metadata properties for a PDF file."""
    files_handler = get_dep(ctx, "files-handler")
    platform_handler = get_dep(ctx, "platform-handler")

    field_mapping = {
        "title": request.title,
        "author": request.author,
        "subject": request.subject,
        "keywords": request.keywords,
        "creator": request.creator,
        "producer": request.producer,
        "creation_date": request.creation_date,
        "mod_date": request.mod_date,
        "trapped": request.trapped,
    }
    metadata = {k: v for k, v in field_mapping.items() if v is not None}

    modified_bytes = platform_handler.set_pdf_metadata(
        files_handler.read(request.input_filename), metadata
    )

    written = files_handler.write(
        request.input_filename, modified_bytes, stem_suffix="metadata-updated"
    )

    return SetMetadataResult(
        input_filename=str(request.input_filename),
        output_filename=written.name,
        fields_updated=len(metadata),
    )


class FlattenRequest(BaseModel):
    """Request to flatten a PDF"""

    input_filename: Path = Field(description="Filename of the source PDF in the workspace")


class FlattenResult(SingleFileOutputBase):
    """Result of flattening a PDF"""

    input_filename: str = Field(description="Filename of the source file in the workspace")


async def flatten_pdf(ctx: CoreContext, request: FlattenRequest) -> FlattenResult:
    """
    Flatten a PDF to make forms and annotations non-editable.

    This operation converts all interactive elements (form fields, annotations, etc.)
    into static content that becomes part of the page and cannot be edited.
    """
    files_handler = get_dep(ctx, "files-handler")
    platform_handler = get_dep(ctx, "platform-handler")

    flattened_bytes = platform_handler.flatten_pdf(files_handler.read(request.input_filename))

    written = files_handler.write(request.input_filename, flattened_bytes, stem_suffix="flattened")

    return FlattenResult(
        input_filename=str(request.input_filename),
        output_filename=written.name,
    )


def register_transformation_tools(mcp: FastMCP) -> None:
    """Register transformation tools with the MCP server"""
    mcp.tool()(merge_files)
    mcp.tool()(compress_file)
    mcp.tool()(split_pdf)
    mcp.tool()(rotate_pdf)
    mcp.tool()(protect_pdf)
    mcp.tool()(unprotect_pdf)
    mcp.tool()(delete_pdf_pages)
    mcp.tool()(set_pdf_metadata)
    mcp.tool()(flatten_pdf)
