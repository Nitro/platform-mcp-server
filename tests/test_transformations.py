# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for transformation tools"""

from unittest.mock import MagicMock  # noqa: TC003

import pytest
from mcp import ClientSession  # noqa: TC002
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
    pdf_a: str,
    pdf_b: str,
    platform_handler_mock: MagicMock,
) -> None:
    """Merge calls platform handler with file contents and returns result."""
    platform_handler_mock.merge_pdfs.return_value = b"merged"
    response = await client.call_tool(
        "merge_files",
        {"merge_request": MergeRequest(input_filenames=[pdf_a, pdf_b]).model_dump()},
    )
    expected = MergeResult(
        output_filename="merged.pdf",
        input_files=[pdf_a, pdf_b],
        input_count=2,
        total_input_size_bytes=26,
        output_size_bytes=6,
    ).model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.merge_pdfs.assert_called_once_with([b"pdf-a-content", b"pdf-b-content"])


@pytest.mark.anyio
async def test_merge_files_missing_file_raises(
    client: ClientSession,
    pdf_a: str,
    platform_handler_mock: MagicMock,
) -> None:
    """Missing input file returns an error response."""
    platform_handler_mock.merge_pdfs.return_value = b"merged"
    response = await client.call_tool(
        "merge_files",
        {"merge_request": MergeRequest(input_filenames=[pdf_a, "missing.pdf"]).model_dump()},
    )
    assert response.isError
    platform_handler_mock.merge_pdfs.assert_not_called()


@pytest.mark.anyio
async def test_merge_files_platform_error_raises(
    client: ClientSession,
    pdf_a: str,
    pdf_b: str,
    platform_handler_mock: MagicMock,
) -> None:
    """Platform handler error returns an error response."""
    platform_handler_mock.merge_pdfs.side_effect = RuntimeError("api-error")
    response = await client.call_tool(
        "merge_files",
        {"merge_request": MergeRequest(input_filenames=[pdf_a, pdf_b]).model_dump()},
    )
    assert response.isError
    platform_handler_mock.merge_pdfs.assert_called_once_with([b"pdf-a-content", b"pdf-b-content"])


@pytest.mark.anyio
async def test_merge_files_custom_output_filename(
    client: ClientSession,
    pdf_a: str,
    pdf_b: str,
    platform_handler_mock: MagicMock,
) -> None:
    """Custom output filename is reflected in the result."""
    platform_handler_mock.merge_pdfs.return_value = b"merged"
    response = await client.call_tool(
        "merge_files",
        {
            "merge_request": MergeRequest(
                input_filenames=[pdf_a, pdf_b], output_filename="out.pdf"
            ).model_dump()
        },
    )
    expected = MergeResult(
        output_filename="out.pdf",
        input_files=[pdf_a, pdf_b],
        input_count=2,
        total_input_size_bytes=26,
        output_size_bytes=6,
    ).model_dump()
    assert response.structuredContent == expected
    platform_handler_mock.merge_pdfs.assert_called_once_with([b"pdf-a-content", b"pdf-b-content"])
