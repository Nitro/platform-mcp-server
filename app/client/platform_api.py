# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Low-level platform API client for Nitro Platform operations"""

import dataclasses
import json
import logging
import time
from collections.abc import Sequence  # noqa: TC003
from enum import StrEnum
from typing import Any, Literal

import httpx  # noqa: TC002

from app.client.enums import ContentType  # noqa: TC001

logger = logging.getLogger("PlatformAPI")


class AcceptFormat(StrEnum):
    """Response format to accept from platform API"""

    BYTES = "bytes"
    JSON = "json"


@dataclasses.dataclass
class URLFile:
    """URL File abstraction for remote file references"""

    content_type: ContentType
    url: str
    name: str = "file"

    def to_multipart(self) -> tuple[str, bytes, str]:
        """Return the multipart data for httpx.post(files=...)"""
        return (
            self.name,
            json.dumps({"URL": self.url, "contentType": self.content_type.value}).encode("utf-8"),
            "application/vnd.gonitro.url+json",
        )


@dataclasses.dataclass
class BytesFile:
    """Bytes File abstraction for in-memory file content"""

    content_type: ContentType
    content: bytes
    name: str = "file"

    def to_multipart(self) -> tuple[str, bytes, str]:
        """Return the multipart data for httpx.post(files=...)"""
        return self.name, self.content, self.content_type.value


File = URLFile | BytesFile


class InvalidRequestError(Exception):
    """Exception raised for invalid requests to the platform API (4xx errors)"""

    status_code: int

    def __init__(self, status_code: int, response: dict[str, Any]) -> None:
        self.status_code = status_code
        super().__init__(f"Invalid request: [{status_code}] |{json.dumps(response, indent=2)}|")


@dataclasses.dataclass
class PlatformApiClient:
    """Low-level client for invoking Nitro Platform operations with async job polling"""

    _httpx_client: httpx.Client
    _platform_url: str
    _default_timeout: float = 30.0
    _job_wait_timeout: float = 120.0

    def _wait_for_job_completion(self, status_url: str, retry_after: float) -> str:
        """Poll job status URL until completion and return result URL"""
        logger.info("Waiting for job at `%s` using short polling", status_url)
        start_time = time.time()

        while True:
            elapsed = time.time() - start_time
            if elapsed > self._job_wait_timeout:
                msg = (
                    f"Job at {status_url} did not complete within {self._job_wait_timeout} seconds"
                )
                raise TimeoutError(msg)

            response = self._httpx_client.get(
                status_url, follow_redirects=False, timeout=self._default_timeout
            )
            result = response.json()
            status = result["status"]

            if status == "running":
                assert response.status_code == 200
                time.sleep(retry_after)
                continue

            if status == "completed":
                assert response.status_code == 302
                return response.headers["Location"]

            if status == "failed":
                msg = f"Job at {status_url} failed: {result}"
                raise RuntimeError(msg)

            msg = f"Unexpected job status: {result}"
            raise RuntimeError(msg)

    def _check_error_response(self, response: httpx.Response) -> None:
        """Check response for errors and raise appropriate exceptions"""
        if 400 <= response.status_code <= 499:
            raise InvalidRequestError(response.status_code, response.json())

        if response.status_code >= 500:
            try:
                error = response.json()
            except json.JSONDecodeError, ValueError:
                error = response.text[:250]
            msg = f"Platform operation failed: [{response.status_code}] {error}"
            raise RuntimeError(msg)

    def run(  # pylint: disable=too-many-arguments,too-many-positional-arguments,too-many-locals
        self,
        path: Literal["conversions", "extractions", "transformations"],
        file_or_files: File | Sequence[File],
        /,
        method: str | None,
        params: dict[str, Any] | None = None,
        accept_format: AcceptFormat = AcceptFormat.JSON,
    ) -> httpx.Response:
        """
        Invoke a platform endpoint with async job polling.

        All operations run asynchronously with job polling. The client submits the job,
        polls for completion, and returns the final result.

        Args:
            path: API endpoint path (conversions, extractions, transformations)
            file_or_files: Single file or list of files to process
            method: Operation method (e.g., "compress", "merge", "extract-forms")
            params: Operation parameters dictionary
            accept_format: Response format to accept (BYTES for PDFs, JSON for data)

        Returns:
            HTTP response from the platform API with the operation result

        Raises:
            InvalidRequestError: For 4xx client errors
            RuntimeError: For 5xx server errors or job failures
            TimeoutError: If async job doesn't complete within timeout period
        """
        params = {} if params is None else params
        headers: dict[str, str] = {"Prefer": "respond-async"}
        data: dict[str, Any] = {"params": json.dumps(params)}

        # Handle method
        if method is not None:
            data["method"] = method
        else:
            assert path == "conversions", "Method is required for transformations and extractions"

        # Handle file upload (single file or multiple files)
        if isinstance(file_or_files, (URLFile, BytesFile)):
            files = {"file": file_or_files.to_multipart()}
        else:
            files = [("files", file.to_multipart()) for file in file_or_files]

        # Submit async job
        logger.info("Starting async job [%s/%s]", path, method)
        start_time = time.time()

        response = self._httpx_client.post(
            f"{self._platform_url}/{path}",
            files=files,
            data=data,
            headers=headers,
            timeout=self._default_timeout,
        )
        self._check_error_response(response)

        # Job should be accepted (202)
        assert response.status_code == 202
        status_url = response.headers["Location"]
        retry_after = float(response.headers.get("Retry-After", 1.0))
        logger.info("Job started, status URL: %s", status_url)

        # Poll for completion
        result_url = self._wait_for_job_completion(status_url, retry_after)

        # Fetch final result
        result_headers = (
            {"Accept": "application/octet-stream"} if accept_format == AcceptFormat.BYTES else {}
        )
        result_response = self._httpx_client.get(
            result_url,
            headers=result_headers,
            timeout=self._default_timeout,
        )

        # Check for errors in result fetch
        self._check_error_response(result_response)

        elapsed = time.time() - start_time
        logger.info("Platform operation [%s/%s] completed in %.2fs", path, method, elapsed)

        return result_response
