# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Tests for PlatformApiClient"""

from typing import Literal

import httpx
import pytest
from pytest_httpx import HTTPXMock

from app.client.enums import ContentType
from app.client.platform_client import (
    AcceptFormat,
    BytesFile,
    File,
    InvalidRequestError,
    PlatformApiClient,
    URLFile,
)

type Path = Literal["conversions", "extractions", "transformations"]


@pytest.fixture(name="platform_client")
def _platform_client() -> PlatformApiClient:
    return PlatformApiClient(
        _httpx_client=httpx.Client(headers={"Authorization": "Bearer test-token"}, timeout=60.0),
        _platform_url="https://api.example.com",
        _job_wait_timeout=120.0,
    )


@pytest.fixture(name="pdf_file")
def _pdf_file() -> BytesFile:
    return BytesFile(content_type=ContentType.PDF, content=b"pdf-content", name="input.pdf")


@pytest.fixture(
    name="file",
    params=[
        BytesFile(content_type=ContentType.PDF, content=b"pdf-content", name="input.pdf"),
        URLFile(
            content_type=ContentType.PDF,
            url="https://files.example.com/input.pdf",
            name="input.pdf",
        ),
    ],
    ids=["bytes-file", "url-file"],
)
def _file(request: pytest.FixtureRequest) -> File:
    return request.param


@pytest.fixture(
    name="path",
    params=["conversions", "extractions", "transformations"],
)
def _path(request: pytest.FixtureRequest) -> Path:
    return request.param


def _mock_job(
    httpx_mock: HTTPXMock,
    *,
    path: str = "conversions",
    result_status: int = 200,
    result_content: bytes = b"result",
) -> None:
    httpx_mock.add_response(
        method="POST",
        url=f"https://api.example.com/{path}",
        status_code=202,
        headers={"Location": "https://api.example.com/jobs/job-id", "Retry-After": "1.0"},
    )
    httpx_mock.add_response(
        method="GET",
        url="https://api.example.com/jobs/job-id",
        status_code=302,
        headers={"Location": "https://api.example.com/results/job-id"},
        json={"status": "completed"},
    )
    httpx_mock.add_response(
        method="GET",
        url="https://api.example.com/results/job-id",
        status_code=result_status,
        content=result_content,
    )


def test_run_returns_result(
    platform_client: PlatformApiClient,
    httpx_mock: HTTPXMock,
    file: File,
    path: Path,
) -> None:
    """Successful run returns the result response for all file types and paths."""
    _mock_job(httpx_mock, path=path, result_content=b"output")

    response = platform_client.run(
        path,
        file,
        method="merge" if path != "conversions" else None,
        params={},
        accept_format=AcceptFormat.BYTES,
    )

    assert response.status_code == 200
    assert response.content == b"output"


def test_run_client_error_raises(
    platform_client: PlatformApiClient,
    pdf_file: BytesFile,
    httpx_mock: HTTPXMock,
) -> None:
    """4xx on job submission raises InvalidRequestError."""
    httpx_mock.add_response(
        method="POST",
        url="https://api.example.com/conversions",
        status_code=400,
        json={"error": "bad-request"},
    )

    with pytest.raises(InvalidRequestError):
        platform_client.run(
            "conversions", pdf_file, method=None, params={}, accept_format=AcceptFormat.BYTES
        )


def test_run_server_error_raises(
    platform_client: PlatformApiClient,
    pdf_file: BytesFile,
    httpx_mock: HTTPXMock,
) -> None:
    """5xx on result fetch raises RuntimeError."""
    _mock_job(httpx_mock, result_status=500, result_content=b'{"error": "server-error"}')

    with pytest.raises(RuntimeError, match=r"Platform operation failed: \[500\]"):
        platform_client.run(
            "conversions", pdf_file, method=None, params={}, accept_format=AcceptFormat.BYTES
        )


def test_run_polls_until_complete(
    platform_client: PlatformApiClient,
    pdf_file: BytesFile,
    httpx_mock: HTTPXMock,
) -> None:
    """Job that is running is polled until completed."""
    httpx_mock.add_response(
        method="POST",
        url="https://api.example.com/conversions",
        status_code=202,
        headers={"Location": "https://api.example.com/jobs/job-id", "Retry-After": "0.001"},
    )
    for _ in range(3):
        httpx_mock.add_response(
            method="GET",
            url="https://api.example.com/jobs/job-id",
            status_code=200,
            json={"status": "running"},
        )
    httpx_mock.add_response(
        method="GET",
        url="https://api.example.com/jobs/job-id",
        status_code=302,
        headers={"Location": "https://api.example.com/results/job-id"},
        json={"status": "completed"},
    )
    httpx_mock.add_response(
        method="GET",
        url="https://api.example.com/results/job-id",
        status_code=200,
        content=b"output",
    )

    response = platform_client.run(
        "conversions", pdf_file, method=None, params={}, accept_format=AcceptFormat.BYTES
    )

    assert response.content == b"output"


@pytest.mark.httpx_mock(assert_all_responses_were_requested=False)
def test_run_job_timeout_raises(pdf_file: BytesFile, httpx_mock: HTTPXMock) -> None:
    """Job that never completes raises TimeoutError."""
    httpx_mock.add_response(
        method="POST",
        url="https://api.example.com/conversions",
        status_code=202,
        headers={"Location": "https://api.example.com/jobs/job-id", "Retry-After": "0.001"},
    )
    for _ in range(200):
        httpx_mock.add_response(
            method="GET",
            url="https://api.example.com/jobs/job-id",
            status_code=200,
            json={"status": "running"},
        )

    short_timeout_client = PlatformApiClient(
        _httpx_client=httpx.Client(headers={"Authorization": "Bearer test-token"}, timeout=60.0),
        _platform_url="https://api.example.com",
        _job_wait_timeout=0.1,
    )

    with pytest.raises(TimeoutError, match="did not complete within"):
        short_timeout_client.run(
            "conversions", pdf_file, method=None, params={}, accept_format=AcceptFormat.BYTES
        )
