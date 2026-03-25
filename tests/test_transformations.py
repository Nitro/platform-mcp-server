# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for transformation tools"""

from pathlib import Path
from unittest.mock import MagicMock, call

import pytest
from mcp import ClientSession
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


def test_merge_request_rejects_empty_list() -> None:
    """Empty input list fails validation."""
    with pytest.raises(ValidationError):
        MergeRequest(input_filenames=[])


def test_merge_request_requires_minimum_two_files() -> None:
    """Single file input fails validation."""
    with pytest.raises(ValidationError):
        MergeRequest(input_filenames=["file1.pdf"])


@pytest.mark.anyio
async def test_merge_files(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Merge calls platform handler with file contents and returns result."""
    files_handler_mock.read.side_effect = [b"pdf-a-content", b"pdf-b-content"]
    platform_handler_mock.merge_pdfs.return_value = b"merged"
    files_handler_mock.write.return_value = Path("merged.pdf")
    response = await client.call_tool(
        "merge_files",
        {"request": MergeRequest(input_filenames=["a.pdf", "b.pdf"]).model_dump()},
    )
    expected = MergeResult(
        output_filename="merged.pdf",
        input_filenames=["a.pdf", "b.pdf"],
        input_count=2,
        total_input_size_bytes=26,
        output_size_bytes=6,
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_has_calls([call(Path("a.pdf")), call(Path("b.pdf"))])
    platform_handler_mock.merge_pdfs.assert_called_once_with([b"pdf-a-content", b"pdf-b-content"])
    files_handler_mock.write.assert_called_once_with("merged.pdf", b"merged")


@pytest.mark.anyio
async def test_merge_files_missing_file_raises(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Missing input file returns an error response."""
    files_handler_mock.read.side_effect = [b"pdf-a-content", FileNotFoundError]
    response = await client.call_tool(
        "merge_files",
        {"request": MergeRequest(input_filenames=["a.pdf", "missing.pdf"]).model_dump()},
    )
    assert response.isError
    platform_handler_mock.merge_pdfs.assert_not_called()


@pytest.mark.anyio
async def test_merge_files_platform_error_raises(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Platform handler error returns an error response."""
    files_handler_mock.read.side_effect = [b"pdf-a-content", b"pdf-b-content"]
    platform_handler_mock.merge_pdfs.side_effect = RuntimeError("api-error")
    response = await client.call_tool(
        "merge_files",
        {"request": MergeRequest(input_filenames=["a.pdf", "b.pdf"]).model_dump()},
    )
    assert response.isError
    platform_handler_mock.merge_pdfs.assert_called_once_with([b"pdf-a-content", b"pdf-b-content"])
    files_handler_mock.write.assert_not_called()


@pytest.mark.anyio
async def test_merge_files_custom_output_filename(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Custom output filename is reflected in the result."""
    files_handler_mock.read.side_effect = [b"pdf-a-content", b"pdf-b-content"]
    platform_handler_mock.merge_pdfs.return_value = b"merged"
    files_handler_mock.write.return_value = Path("out.pdf")
    response = await client.call_tool(
        "merge_files",
        {
            "request": MergeRequest(
                input_filenames=["a.pdf", "b.pdf"], output_filename="out.pdf"
            ).model_dump()
        },
    )
    expected = MergeResult(
        output_filename="out.pdf",
        input_filenames=["a.pdf", "b.pdf"],
        input_count=2,
        total_input_size_bytes=26,
        output_size_bytes=6,
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.write.assert_called_once_with("out.pdf", b"merged")
    platform_handler_mock.merge_pdfs.assert_called_once_with([b"pdf-a-content", b"pdf-b-content"])


# Compress File Tests


@pytest.mark.anyio
async def test_compress_file_medium(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Compress file calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.compress_pdf.return_value = b"compressed"
    files_handler_mock.write.return_value = Path("a-compressed-medium.pdf")

    response = await client.call_tool(
        "compress_file",
        {"request": CompressRequest(input_filename=Path("a.pdf"), level="medium").model_dump()},
    )

    expected = CompressResult(
        input_filename="a.pdf",
        output_filename="a-compressed-medium.pdf",
        original_size_bytes=11,
        compressed_size_bytes=10,
        reduction_percent=9.1,
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_called_once_with(Path("a.pdf"))
    platform_handler_mock.compress_pdf.assert_called_once_with(
        b"pdf-content", CompressionLevel.MEDIUM
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b"compressed", stem_suffix="compressed-medium"
    )


@pytest.mark.anyio
async def test_compress_file_invalid_level(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Invalid compression level returns error."""
    response = await client.call_tool(
        "compress_file",
        {"request": CompressRequest(input_filename=Path("a.pdf"), level="invalid").model_dump()},
    )
    assert response.isError
    platform_handler_mock.compress_pdf.assert_not_called()
    files_handler_mock.write.assert_not_called()


# Split PDF Tests


@pytest.mark.anyio
async def test_split_pdf_success(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Split PDF calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.split_pdf.return_value = b"zip-content"
    files_handler_mock.write.return_value = Path("a-split.zip")

    response = await client.call_tool(
        "split_pdf",
        {
            "request": SplitRequest(
                input_filename=Path("a.pdf"), page_ranges=["1-2", "4"]
            ).model_dump()
        },
    )

    expected = SplitResult(
        input_filename="a.pdf",
        output_filename="a-split.zip",
        split_count=2,
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_called_once_with(Path("a.pdf"))
    platform_handler_mock.split_pdf.assert_called_once_with(b"pdf-content", [[0, 1], [3]])
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b"zip-content", stem_suffix="split", ext="zip"
    )


# Rotate PDF Tests


@pytest.mark.anyio
async def test_rotate_pdf_success(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Rotate PDF calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.rotate_pdf.return_value = b"rotated"
    files_handler_mock.write.return_value = Path("a-rotated.pdf")

    response = await client.call_tool(
        "rotate_pdf",
        {
            "request": RotateRequest(
                input_filename=Path("a.pdf"),
                rotations=[Rotation(page_number=1, amount=90), Rotation(page_number=3, amount=180)],
            ).model_dump()
        },
    )

    expected = RotateResult(
        input_filename="a.pdf",
        output_filename="a-rotated.pdf",
        rotation_count=2,
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_called_once_with(Path("a.pdf"))
    platform_handler_mock.rotate_pdf.assert_called_once_with(
        b"pdf-content",
        [{"pageIndex": 0, "amount": 90}, {"pageIndex": 2, "amount": 180}],
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b"rotated", stem_suffix="rotated"
    )


@pytest.mark.anyio
async def test_rotate_pdf_invalid_degrees(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Invalid rotation degrees returns error."""
    response = await client.call_tool(
        "rotate_pdf",
        {"request": {"input_filename": "a.pdf", "rotations": [{"page_number": 1, "amount": 45}]}},
    )
    assert response.isError
    platform_handler_mock.rotate_pdf.assert_not_called()
    files_handler_mock.write.assert_not_called()


# Protect PDF Tests


@pytest.mark.anyio
async def test_protect_pdf_success(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Protect PDF calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.protect_pdf.return_value = b"protected"
    files_handler_mock.write.return_value = Path("a-protected.pdf")

    response = await client.call_tool(
        "protect_pdf",
        {
            "request": ProtectRequest(
                input_filename=Path("a.pdf"),
                owner_password="owner123",
                user_password="user123",
                permissions=["print", "copy"],
            ).model_dump()
        },
    )

    expected = ProtectResult(
        input_filename="a.pdf",
        output_filename="a-protected.pdf",
        has_owner_password=True,
        has_user_password=True,
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_called_once_with(Path("a.pdf"))
    platform_handler_mock.protect_pdf.assert_called_once_with(
        b"pdf-content",
        owner_password="owner123",
        user_password="user123",
        permissions=["print", "copy"],
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b"protected", stem_suffix="protected"
    )


# Unprotect PDF Tests


@pytest.mark.anyio
async def test_unprotect_pdf_success(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Unprotect PDF calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.unprotect_pdf.return_value = b"unprotected"
    files_handler_mock.write.return_value = Path("a-unprotected.pdf")

    response = await client.call_tool(
        "unprotect_pdf",
        {
            "request": UnprotectRequest(
                input_filename=Path("a.pdf"), owner_password="owner123"
            ).model_dump()
        },
    )

    expected = UnprotectResult(
        input_filename="a.pdf",
        output_filename="a-unprotected.pdf",
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_called_once_with(Path("a.pdf"))
    platform_handler_mock.unprotect_pdf.assert_called_once_with(
        b"pdf-content",
        owner_password="owner123",
        user_password=None,
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b"unprotected", stem_suffix="unprotected"
    )


# Delete Pages Tests


@pytest.mark.anyio
async def test_delete_pdf_pages_success(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Delete pages calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.delete_pdf_pages.return_value = b"modified"
    files_handler_mock.write.return_value = Path("a-pages-deleted.pdf")

    response = await client.call_tool(
        "delete_pdf_pages",
        {
            "request": DeletePagesRequest(
                input_filename=Path("a.pdf"), page_numbers="1,3,5-7"
            ).model_dump()
        },
    )

    expected = DeletePagesResult(
        input_filename="a.pdf",
        output_filename="a-pages-deleted.pdf",
        pages_deleted=5,
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_called_once_with(Path("a.pdf"))
    platform_handler_mock.delete_pdf_pages.assert_called_once_with(
        b"pdf-content",
        [0, 2, 4, 5, 6],
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b"modified", stem_suffix="pages-deleted"
    )


@pytest.mark.anyio
async def test_delete_pdf_pages_invalid_range(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Invalid page range returns error."""
    response = await client.call_tool(
        "delete_pdf_pages",
        {
            "request": DeletePagesRequest(
                input_filename=Path("a.pdf"), page_numbers="5-2"
            ).model_dump()
        },
    )
    assert response.isError
    platform_handler_mock.delete_pdf_pages.assert_not_called()
    files_handler_mock.write.assert_not_called()


# Set Metadata Tests


@pytest.mark.anyio
async def test_set_pdf_metadata_success(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Set metadata calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.set_pdf_metadata.return_value = b"metadata-updated"
    files_handler_mock.write.return_value = Path("a-metadata-updated.pdf")

    response = await client.call_tool(
        "set_pdf_metadata",
        {
            "request": SetMetadataRequest(
                input_filename=Path("a.pdf"),
                title="Test Doc",
                author="John Doe",
            ).model_dump()
        },
    )

    expected = SetMetadataResult(
        input_filename="a.pdf",
        output_filename="a-metadata-updated.pdf",
        fields_updated=2,
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_called_once_with(Path("a.pdf"))
    platform_handler_mock.set_pdf_metadata.assert_called_once_with(
        b"pdf-content",
        {"title": "Test Doc", "author": "John Doe"},
    )
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b"metadata-updated", stem_suffix="metadata-updated"
    )


# Flatten PDF Tests


@pytest.mark.anyio
async def test_flatten_pdf_success(
    client: ClientSession,
    files_handler_mock: MagicMock,
    platform_handler_mock: MagicMock,
) -> None:
    """Flatten PDF calls handler with correct args and returns result."""
    files_handler_mock.read.return_value = b"pdf-content"
    platform_handler_mock.flatten_pdf.return_value = b"flattened"
    files_handler_mock.write.return_value = Path("a-flattened.pdf")

    response = await client.call_tool(
        "flatten_pdf",
        {"request": FlattenRequest(input_filename=Path("a.pdf")).model_dump()},
    )

    expected = FlattenResult(
        input_filename="a.pdf",
        output_filename="a-flattened.pdf",
    ).model_dump()
    assert response.structuredContent == expected
    files_handler_mock.read.assert_called_once_with(Path("a.pdf"))
    platform_handler_mock.flatten_pdf.assert_called_once_with(b"pdf-content")
    files_handler_mock.write.assert_called_once_with(
        Path("a.pdf"), b"flattened", stem_suffix="flattened"
    )
