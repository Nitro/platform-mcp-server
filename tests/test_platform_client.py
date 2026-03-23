# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for PlatformHandler"""

import pytest
from pytest_httpx import HTTPXMock  # noqa: TC002

from app.client import PlatformHandler


@pytest.fixture(name="platform_handler")
def _platform_handler() -> PlatformHandler:
    """Create PlatformHandler instance for testing"""
    return PlatformHandler(
        base_url="https://test-api.example.com",
        auth_token="test-token-123",
        timeout=120.0,
    )


def test_merge_pdfs_success(platform_handler: PlatformHandler, httpx_mock: HTTPXMock) -> None:
    """Test successful PDF merge"""
    # Mock the async job submission (202)
    httpx_mock.add_response(
        method="POST",
        url="https://test-api.example.com/transformations",
        status_code=202,
        headers={
            "Location": "https://test-api.example.com/jobs/123",
            "Retry-After": "1.0",
        },
    )

    # Mock job status polling (302 completed with redirect)
    httpx_mock.add_response(
        method="GET",
        url="https://test-api.example.com/jobs/123",
        status_code=302,
        headers={"Location": "https://test-api.example.com/results/123"},
        json={"status": "completed"},
    )

    # Mock result fetch (200 with PDF bytes)
    httpx_mock.add_response(
        method="GET",
        url="https://test-api.example.com/results/123",
        status_code=200,
        content=b"merged-pdf-content",
    )

    # Test merge
    pdf1 = b"pdf1"
    pdf2 = b"pdf2"
    result = platform_handler.merge_pdfs([pdf1, pdf2], ["file1.pdf", "file2.pdf"])

    assert result == b"merged-pdf-content"


def test_merge_pdfs_empty_list(platform_handler: PlatformHandler) -> None:
    """Test merge with empty file list raises ValueError"""
    with pytest.raises(ValueError, match="At least one PDF file is required"):
        platform_handler.merge_pdfs([])


def test_merge_pdfs_auto_filenames(
    platform_handler: PlatformHandler, httpx_mock: HTTPXMock
) -> None:
    """Test merge with auto-generated filenames"""
    # Mock responses
    httpx_mock.add_response(
        method="POST",
        url="https://test-api.example.com/transformations",
        status_code=202,
        headers={
            "Location": "https://test-api.example.com/jobs/123",
            "Retry-After": "1.0",
        },
    )

    httpx_mock.add_response(
        method="GET",
        url="https://test-api.example.com/jobs/123",
        status_code=302,
        headers={"Location": "https://test-api.example.com/results/123"},
        json={"status": "completed"},
    )

    httpx_mock.add_response(
        method="GET",
        url="https://test-api.example.com/results/123",
        status_code=200,
        content=b"merged-pdf",
    )

    # Test with auto-generated filenames
    result = platform_handler.merge_pdfs([b"pdf1", b"pdf2"])

    assert result == b"merged-pdf"


def test_merge_pdfs_failure(platform_handler: PlatformHandler, httpx_mock: HTTPXMock) -> None:
    """Test merge failure raises RuntimeError"""
    # Mock job submission and completion
    httpx_mock.add_response(
        method="POST",
        url="https://test-api.example.com/transformations",
        status_code=202,
        headers={
            "Location": "https://test-api.example.com/jobs/123",
            "Retry-After": "1.0",
        },
    )

    httpx_mock.add_response(
        method="GET",
        url="https://test-api.example.com/jobs/123",
        status_code=302,
        headers={"Location": "https://test-api.example.com/results/123"},
        json={"status": "completed"},
    )

    # Mock result fetch with error
    httpx_mock.add_response(
        method="GET",
        url="https://test-api.example.com/results/123",
        status_code=500,
        json={"error": "Internal server error"},
    )

    with pytest.raises(RuntimeError, match=r"Platform operation failed: \[500\]"):
        platform_handler.merge_pdfs([b"pdf1", b"pdf2"])


@pytest.mark.httpx_mock(assert_all_responses_were_requested=False)
def test_merge_pdfs_job_timeout(httpx_mock: HTTPXMock) -> None:
    """Test merge with job timeout"""
    # Mock job submission
    httpx_mock.add_response(
        method="POST",
        url="https://test-api.example.com/transformations",
        status_code=202,
        headers={
            "Location": "https://test-api.example.com/jobs/123",
            "Retry-After": "0.001",
        },
    )

    # Mock job status endpoint to return "running" for multiple polls
    # Register many responses to ensure we don't run out during the timeout period
    for _ in range(200):
        httpx_mock.add_response(
            method="GET",
            url="https://test-api.example.com/jobs/123",
            status_code=200,
            json={"status": "running"},
        )

    # Create handler with very short timeout
    short_timeout_handler = PlatformHandler(
        base_url="https://test-api.example.com",
        auth_token="test-token",
        timeout=0.1,  # 100ms timeout
    )

    with pytest.raises(TimeoutError, match="did not complete within"):
        short_timeout_handler.merge_pdfs([b"pdf1", b"pdf2"])
