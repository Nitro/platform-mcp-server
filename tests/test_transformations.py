# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for transformation tools"""

from pathlib import Path
from unittest.mock import MagicMock, call

import pytest
from mcp import ClientSession
from pydantic import ValidationError

from app.tools.transformations import MergeRequest, MergeResult


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
