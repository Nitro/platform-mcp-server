# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for transformation tools"""

from pathlib import Path
from unittest.mock import MagicMock, call

import pytest
from pydantic import ValidationError

from app.client import CompressionLevel
from app.tools.transformations import (
    CompressRequest,
    CompressResult,
    DeletePagesRequest,
    DeletePagesResult,
    FlattenRequest,
    FlattenResult,
    MergeRequest,
    MergeResult,
    ProtectRequest,
    ProtectResult,
    RotateRequest,
    RotateResult,
    Rotation,
    SetMetadataRequest,
    SetMetadataResult,
    SplitRequest,
    SplitResult,
    UnprotectRequest,
    UnprotectResult,
)
from tests.tool_caller import ToolCaller


def test_merge_request_rejects_empty_list() -> None:
    """Empty input list fails validation."""
    with pytest.raises(ValidationError):
        MergeRequest(input_paths=[])


def test_merge_request_requires_minimum_two_files() -> None:
    """Single file input fails validation."""
    with pytest.raises(ValidationError):
        MergeRequest(input_paths=[Path("/tmp/file1.pdf")])  # noqa: S108


@pytest.mark.anyio
async def test_merge_files(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Merge calls platform handler with file contents and returns result."""
    files_handler_mock.read.side_effect = [b"pdf-a-content", b"pdf-b-content"]
    platform_handler_mock.merge_pdfs.return_value = b"merged"
    files_handler_mock.write.return_value = tmp_path / "merged.pdf"
    await tool_caller.call(
        "merge_files",
        MergeRequest(input_paths=[tmp_path / "a.pdf", tmp_path / "b.pdf"]),
        expected_result=MergeResult(
            output_filename="merged.pdf",
            input_paths=[str(tmp_path / "a.pdf"), str(tmp_path / "b.pdf")],
            input_count=2,
            total_input_size_bytes=26,
            output_size_bytes=6,
        ),
    )
    files_handler_mock.read.assert_has_calls([
        call(tmp_path / "a.pdf"),
        call(tmp_path / "b.pdf"),
    ])
    platform_handler_mock.merge_pdfs.assert_called_once_with([b"pdf-a-content", b"pdf-b-content"])
    files_handler_mock.write.assert_called_once_with(tmp_path / "merged.pdf", b"merged")


@pytest.mark.anyio
async def test_merge_files_missing_file_raises(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Missing input file returns an error response."""
    files_handler_mock.read.side_effect = [b"pdf-a-content", FileNotFoundError]
    await tool_caller.call(
        "merge_files",
        MergeRequest(input_paths=[tmp_path / "a.pdf", tmp_path / "missing.pdf"]),
        expect_error=True,
    )
    platform_handler_mock.merge_pdfs.assert_not_called()


@pytest.mark.anyio
async def test_merge_files_platform_error_raises(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Platform handler error returns an error response."""
    files_handler_mock.read.side_effect = [b"pdf-a-content", b"pdf-b-content"]
    platform_handler_mock.merge_pdfs.side_effect = RuntimeError("api-error")
    await tool_caller.call(
        "merge_files",
        MergeRequest(input_paths=[tmp_path / "a.pdf", tmp_path / "b.pdf"]),
        expect_error=True,
    )
    platform_handler_mock.merge_pdfs.assert_called_once_with([b"pdf-a-content", b"pdf-b-content"])
    files_handler_mock.write.assert_not_called()


@pytest.mark.anyio
async def test_merge_files_custom_output_filename(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Custom output filename is reflected in the result."""
    files_handler_mock.read.side_effect = [b"pdf-a-content", b"pdf-b-content"]
    platform_handler_mock.merge_pdfs.return_value = b"merged"
    files_handler_mock.write.return_value = tmp_path / "out.pdf"
    await tool_caller.call(
        "merge_files",
        MergeRequest(
            input_paths=[tmp_path / "a.pdf", tmp_path / "b.pdf"],
            output_filename="out.pdf",
        ),
        expected_result=MergeResult(
            output_filename="out.pdf",
            input_paths=[str(tmp_path / "a.pdf"), str(tmp_path / "b.pdf")],
            input_count=2,
            total_input_size_bytes=26,
            output_size_bytes=6,
        ),
    )
    files_handler_mock.write.assert_called_once_with(tmp_path / "out.pdf", b"merged")
    platform_handler_mock.merge_pdfs.assert_called_once_with([b"pdf-a-content", b"pdf-b-content"])


@pytest.mark.anyio
async def test_merge_files_three_files(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Merge works with three files."""
    files_handler_mock.read.side_effect = [b"pdf-a-content", b"pdf-b-content", b"pdf-c-content"]
    platform_handler_mock.merge_pdfs.return_value = b"merged"
    files_handler_mock.write.return_value = tmp_path / "merged.pdf"

    await tool_caller.call(
        "merge_files",
        MergeRequest(input_paths=[tmp_path / "a.pdf", tmp_path / "b.pdf", tmp_path / "c.pdf"]),
        expected_result=MergeResult(
            output_filename="merged.pdf",
            input_paths=[
                str(tmp_path / "a.pdf"),
                str(tmp_path / "b.pdf"),
                str(tmp_path / "c.pdf"),
            ],
            input_count=3,
            total_input_size_bytes=39,
            output_size_bytes=6,
        ),
    )
    files_handler_mock.read.assert_has_calls([
        call(tmp_path / "a.pdf"),
        call(tmp_path / "b.pdf"),
        call(tmp_path / "c.pdf"),
    ])
    platform_handler_mock.merge_pdfs.assert_called_once_with([
        b"pdf-a-content",
        b"pdf-b-content",
        b"pdf-c-content",
    ])


# Compress File Tests


@pytest.mark.anyio
async def test_compress_file_medium(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Compress file calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.compress_pdf.return_value = b"compressed"
    files_handler_mock.write.return_value = tmp_path / "a-compressed-medium.pdf"

    await tool_caller.call(
        "compress_file",
        CompressRequest(input_path=tmp_path / "a.pdf", level="medium"),
        expected_result=CompressResult(
            output_filename="a-compressed-medium.pdf",
            original_size_bytes=11,
            compressed_size_bytes=10,
            reduction_percent=9.1,
        ),
    )
    files_handler_mock.read.assert_called_once_with(tmp_path / "a.pdf")
    platform_handler_mock.compress_pdf.assert_called_once_with(
        b"pdf-content", CompressionLevel.MEDIUM
    )
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", b"compressed", stem_suffix="compressed-medium"
    )


@pytest.mark.anyio
async def test_compress_file_invalid_level(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Invalid compression level returns error."""
    await tool_caller.call(
        "compress_file",
        CompressRequest(input_path=tmp_path / "a.pdf", level="invalid"),
        expect_error=True,
    )
    platform_handler_mock.compress_pdf.assert_not_called()
    files_handler_mock.write.assert_not_called()


# Split PDF Tests


@pytest.mark.anyio
async def test_split_pdf_success(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Split PDF calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.split_pdf.return_value = b"zip-content"
    files_handler_mock.write.return_value = tmp_path / "a-split.zip"

    await tool_caller.call(
        "split_pdf",
        SplitRequest(input_path=tmp_path / "a.pdf", page_ranges=["1-2", "4"]),
        expected_result=SplitResult(output_filename="a-split.zip", split_count=2),
    )
    files_handler_mock.read.assert_called_once_with(tmp_path / "a.pdf")
    platform_handler_mock.split_pdf.assert_called_once_with(b"pdf-content", [[0, 1], [3]])
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", b"zip-content", stem_suffix="split", ext="zip"
    )


# Rotate PDF Tests


@pytest.mark.anyio
async def test_rotate_pdf_success(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Rotate PDF calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.rotate_pdf.return_value = b"rotated"
    files_handler_mock.write.return_value = tmp_path / "a-rotated.pdf"

    await tool_caller.call(
        "rotate_pdf",
        RotateRequest(
            input_path=tmp_path / "a.pdf",
            rotations=[Rotation(page_number=1, amount=90), Rotation(page_number=3, amount=180)],
        ),
        expected_result=RotateResult(output_filename="a-rotated.pdf", rotation_count=2),
    )
    files_handler_mock.read.assert_called_once_with(tmp_path / "a.pdf")
    platform_handler_mock.rotate_pdf.assert_called_once_with(
        b"pdf-content",
        [{"pageIndex": 0, "amount": 90}, {"pageIndex": 2, "amount": 180}],
    )
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", b"rotated", stem_suffix="rotated"
    )


@pytest.mark.anyio
async def test_rotate_pdf_invalid_degrees(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Invalid rotation degrees returns error."""
    await tool_caller.call(
        "rotate_pdf",
        {
            "input_path": str(tmp_path / "a.pdf"),
            "rotations": [{"page_number": 1, "amount": 45}],
        },
        expect_error=True,
    )
    platform_handler_mock.rotate_pdf.assert_not_called()
    files_handler_mock.write.assert_not_called()


# Protect PDF Tests


@pytest.mark.anyio
async def test_protect_pdf_success(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Protect PDF calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.protect_pdf.return_value = b"protected"
    files_handler_mock.write.return_value = tmp_path / "a-protected.pdf"

    await tool_caller.call(
        "protect_pdf",
        ProtectRequest(
            input_path=tmp_path / "a.pdf",
            owner_password="owner-pw",
            user_password="user-pw",
            permissions=["print", "copy"],
        ),
        expected_result=ProtectResult(
            output_filename="a-protected.pdf",
            has_owner_password=True,
            has_user_password=True,
        ),
    )
    files_handler_mock.read.assert_called_once_with(tmp_path / "a.pdf")
    platform_handler_mock.protect_pdf.assert_called_once_with(
        b"pdf-content",
        owner_password="owner-pw",
        user_password="user-pw",
        permissions=["print", "copy"],
    )
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", b"protected", stem_suffix="protected"
    )


# Unprotect PDF Tests


@pytest.mark.anyio
async def test_unprotect_pdf_success(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Unprotect PDF calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.unprotect_pdf.return_value = b"unprotected"
    files_handler_mock.write.return_value = tmp_path / "a-unprotected.pdf"

    await tool_caller.call(
        "unprotect_pdf",
        UnprotectRequest(input_path=tmp_path / "a.pdf", owner_password="owner-pw"),
        expected_result=UnprotectResult(output_filename="a-unprotected.pdf"),
    )
    files_handler_mock.read.assert_called_once_with(tmp_path / "a.pdf")
    platform_handler_mock.unprotect_pdf.assert_called_once_with(
        b"pdf-content",
        owner_password="owner-pw",
        user_password=None,
    )
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", b"unprotected", stem_suffix="unprotected"
    )


# Delete Pages Tests


@pytest.mark.anyio
async def test_delete_pdf_pages_success(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Delete pages calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.delete_pdf_pages.return_value = b"modified"
    files_handler_mock.write.return_value = tmp_path / "a-pages-deleted.pdf"

    await tool_caller.call(
        "delete_pdf_pages",
        DeletePagesRequest(input_path=tmp_path / "a.pdf", page_numbers=["1", "3", "5-7"]),
        expected_result=DeletePagesResult(output_filename="a-pages-deleted.pdf", pages_deleted=5),
    )
    files_handler_mock.read.assert_called_once_with(tmp_path / "a.pdf")
    platform_handler_mock.delete_pdf_pages.assert_called_once_with(
        b"pdf-content",
        [0, 2, 4, 5, 6],
    )
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", b"modified", stem_suffix="pages-deleted"
    )


@pytest.mark.anyio
async def test_delete_pdf_pages_invalid_range(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Invalid page range returns error."""
    await tool_caller.call(
        "delete_pdf_pages",
        DeletePagesRequest(input_path=tmp_path / "a.pdf", page_numbers=["5-2"]),
        expect_error=True,
    )
    platform_handler_mock.delete_pdf_pages.assert_not_called()
    files_handler_mock.write.assert_not_called()


# Set Metadata Tests


@pytest.mark.anyio
async def test_set_pdf_metadata_success(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Set metadata calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.set_pdf_metadata.return_value = b"metadata-updated"
    files_handler_mock.write.return_value = tmp_path / "a-metadata-updated.pdf"

    await tool_caller.call(
        "set_pdf_metadata",
        SetMetadataRequest(
            input_path=tmp_path / "a.pdf",
            title="title",
            author="author",
        ),
        expected_result=SetMetadataResult(
            output_filename="a-metadata-updated.pdf", fields_updated=2
        ),
    )
    files_handler_mock.read.assert_called_once_with(tmp_path / "a.pdf")
    platform_handler_mock.set_pdf_metadata.assert_called_once_with(
        b"pdf-content",
        {"title": "title", "author": "author"},
    )
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", b"metadata-updated", stem_suffix="metadata-updated"
    )


# Flatten PDF Tests


@pytest.mark.anyio
async def test_flatten_pdf_success(
    tool_caller: ToolCaller,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
    tmp_path: Path,
) -> None:
    """Flatten PDF calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.flatten_pdf.return_value = b"flattened"
    files_handler_mock.write.return_value = tmp_path / "a-flattened.pdf"

    await tool_caller.call(
        "flatten_pdf",
        FlattenRequest(input_path=tmp_path / "a.pdf"),
        expected_result=FlattenResult(output_filename="a-flattened.pdf"),
    )
    files_handler_mock.read.assert_called_once_with(tmp_path / "a.pdf")
    platform_handler_mock.flatten_pdf.assert_called_once_with(b"pdf-content")
    files_handler_mock.write.assert_called_once_with(
        tmp_path / "a.pdf", b"flattened", stem_suffix="flattened"
    )
