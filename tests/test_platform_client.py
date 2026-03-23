# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for PlatformClientWrapper"""

from unittest.mock import Mock

import httpx
import pytest

from app.client import PlatformClientWrapper


@pytest.fixture(name="mock_httpx_client")
def _mock_httpx_client(monkeypatch: pytest.MonkeyPatch) -> Mock:
    """Mock httpx.Client for testing"""
    mock_client = Mock(spec=httpx.Client)

    def mock_client_factory(**_: object) -> Mock:
        return mock_client

    monkeypatch.setattr("httpx.Client", mock_client_factory)
    return mock_client


@pytest.fixture(name="platform_wrapper")
def _platform_wrapper(mock_httpx_client: Mock) -> PlatformClientWrapper:  # pylint: disable=unused-argument
    """Create PlatformClientWrapper instance for testing"""
    return PlatformClientWrapper(
        base_url="https://test-api.example.com",
        auth_token="test-token-123",
        timeout=120.0,
    )


def test_merge_pdfs_success(
    platform_wrapper: PlatformClientWrapper, mock_httpx_client: Mock
) -> None:
    """Test successful PDF merge"""
    # Mock the async job submission (202)
    submit_response = Mock(spec=httpx.Response)
    submit_response.status_code = 202
    submit_response.headers = {
        "Location": "https://test-api.example.com/jobs/123",
        "Retry-After": "1.0",
    }

    # Mock job status polling (200 running, then 302 completed)
    status_response_running = Mock(spec=httpx.Response)
    status_response_running.status_code = 200
    status_response_running.json.return_value = {"status": "running"}

    status_response_completed = Mock(spec=httpx.Response)
    status_response_completed.status_code = 302
    status_response_completed.headers = {"Location": "https://test-api.example.com/results/123"}
    status_response_completed.json.return_value = {"status": "completed"}

    # Mock result fetch (200 with PDF bytes)
    result_response = Mock(spec=httpx.Response)
    result_response.status_code = 200
    result_response.content = b"merged-pdf-content"

    # Setup mock responses
    mock_httpx_client.post.return_value = submit_response
    mock_httpx_client.get.side_effect = [
        status_response_completed,  # Job completes immediately
        result_response,  # Result fetch
    ]

    # Test merge
    pdf1 = b"pdf1"
    pdf2 = b"pdf2"
    result = platform_wrapper.merge_pdfs([pdf1, pdf2], ["file1.pdf", "file2.pdf"])

    assert result == b"merged-pdf-content"
    assert mock_httpx_client.post.called
    assert mock_httpx_client.get.call_count == 2


def test_merge_pdfs_empty_list(platform_wrapper: PlatformClientWrapper) -> None:
    """Test merge with empty file list raises ValueError"""
    with pytest.raises(ValueError, match="At least one PDF file is required"):
        platform_wrapper.merge_pdfs([])


def test_merge_pdfs_auto_filenames(
    platform_wrapper: PlatformClientWrapper, mock_httpx_client: Mock
) -> None:
    """Test merge with auto-generated filenames"""
    # Mock responses
    submit_response = Mock(spec=httpx.Response)
    submit_response.status_code = 202
    submit_response.headers = {
        "Location": "https://test-api.example.com/jobs/123",
        "Retry-After": "1.0",
    }

    status_response_completed = Mock(spec=httpx.Response)
    status_response_completed.status_code = 302
    status_response_completed.headers = {"Location": "https://test-api.example.com/results/123"}
    status_response_completed.json.return_value = {"status": "completed"}

    result_response = Mock(spec=httpx.Response)
    result_response.status_code = 200
    result_response.content = b"merged-pdf"

    mock_httpx_client.post.return_value = submit_response
    mock_httpx_client.get.side_effect = [status_response_completed, result_response]

    # Test with auto-generated filenames
    result = platform_wrapper.merge_pdfs([b"pdf1", b"pdf2"])

    assert result == b"merged-pdf"


def test_merge_pdfs_failure(
    platform_wrapper: PlatformClientWrapper, mock_httpx_client: Mock
) -> None:
    """Test merge failure raises RuntimeError"""
    # Mock job submission and completion
    submit_response = Mock(spec=httpx.Response)
    submit_response.status_code = 202
    submit_response.headers = {
        "Location": "https://test-api.example.com/jobs/123",
        "Retry-After": "1.0",
    }

    status_response_completed = Mock(spec=httpx.Response)
    status_response_completed.status_code = 302
    status_response_completed.headers = {"Location": "https://test-api.example.com/results/123"}
    status_response_completed.json.return_value = {"status": "completed"}

    # Mock result fetch with error
    result_response = Mock(spec=httpx.Response)
    result_response.status_code = 500

    mock_httpx_client.post.return_value = submit_response
    mock_httpx_client.get.side_effect = [status_response_completed, result_response]

    with pytest.raises(RuntimeError, match="Merge failed with status code: 500"):
        platform_wrapper.merge_pdfs([b"pdf1", b"pdf2"])


def test_merge_pdfs_job_timeout(mock_httpx_client: Mock) -> None:
    """Test merge with job timeout"""
    # Mock job submission
    submit_response = Mock(spec=httpx.Response)
    submit_response.status_code = 202
    submit_response.headers = {
        "Location": "https://test-api.example.com/jobs/123",
        "Retry-After": "0.001",  # Very short retry
    }

    # Mock job status always running
    status_response_running = Mock(spec=httpx.Response)
    status_response_running.status_code = 200
    status_response_running.json.return_value = {"status": "running"}

    mock_httpx_client.post.return_value = submit_response
    mock_httpx_client.get.return_value = status_response_running

    # Create wrapper with very short timeout
    short_timeout_wrapper = PlatformClientWrapper(
        base_url="https://test-api.example.com",
        auth_token="test-token",
        timeout=0.1,  # 100ms timeout
    )

    with pytest.raises(TimeoutError, match="did not complete within"):
        short_timeout_wrapper.merge_pdfs([b"pdf1", b"pdf2"])


def test_close(platform_wrapper: PlatformClientWrapper, mock_httpx_client: Mock) -> None:
    """Test client close"""
    platform_wrapper.close()
    mock_httpx_client.close.assert_called_once()
