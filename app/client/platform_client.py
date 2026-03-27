# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Low-level platform API client for Nitro Platform operations"""

import dataclasses
import json
import logging
import time
from collections.abc import Iterator, Sequence
from enum import StrEnum
from typing import Annotated, Any, Literal

import httpx
from httpx_sse import connect_sse
from pydantic import BaseModel, Field, TypeAdapter

from app.client.enums import ContentType

logger = logging.getLogger("PlatformAPI")


class _BaseEvent(BaseModel):
    job_id: str = Field(alias="jobID")


class _ProgressUpdateEvent(_BaseEvent):
    status: Literal["running"]
    progress: float


class _RedirectEvent(_BaseEvent):
    status: Literal["completed"]
    location: str


class _FailedEvent(_BaseEvent):
    status: Literal["failed"]
    location: str


_SSEEvent = Annotated[
    _ProgressUpdateEvent | _RedirectEvent | _FailedEvent, Field(discriminator="status")
]


class AcceptFormat(StrEnum):
    """Response format to accept from platform API"""

    BYTES = "bytes"
    JSON = "json"


@dataclasses.dataclass(slots=True)
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


@dataclasses.dataclass(slots=True)
class BytesFile:
    """Bytes File abstraction for in-memory file content"""

    content_type: ContentType
    content: bytes
    name: str = "file"

    def to_multipart(self) -> tuple[str, bytes, str]:
        """Return the multipart data for httpx.post(files=...)"""
        return self.name, self.content, self.content_type.value


File = URLFile | BytesFile


class GenericFailedError(Exception):
    """Raised when a platform operation fails due to a developer or platform issue."""

    def __init__(self) -> None:
        super().__init__(
            "Platform operation failed. Try again or contact Nitro support if the issue persists."
        )


@dataclasses.dataclass
class PlatformApiClient:
    """Low-level client for invoking Nitro Platform operations with async job polling"""

    _httpx_client: httpx.Client
    _platform_url: str
    _default_timeout: float = 30.0
    _job_wait_timeout: float = 120.0

    def _iter_sse_events(self, status_url: str) -> Iterator[_SSEEvent]:
        """Helper generator to stream SSE events from status URL"""
        logger.info("Connecting to SSE stream at `%s`", status_url)
        start_time = time.perf_counter()
        with connect_sse(
            self._httpx_client, "GET", status_url, timeout=self._job_wait_timeout
        ) as event_source:
            _sse_event_adapter: TypeAdapter[_SSEEvent] = TypeAdapter(_SSEEvent)
            for sse in event_source.iter_sse():
                elapsed = time.perf_counter() - start_time
                if elapsed >= self._job_wait_timeout:
                    msg = f"Job timed out after {elapsed:.2f}s"
                    raise TimeoutError(msg)
                yield _sse_event_adapter.validate_json(sse.data)

    def _wait_for_job(self, status_url: str) -> tuple[bool, str]:
        """Stream SSE events from status URL until completion and return result URL"""
        logger.info("Waiting for job at `%s` via SSE", status_url)
        for event in self._iter_sse_events(status_url):
            if isinstance(event, _ProgressUpdateEvent):
                logger.info("Job progress: %.0f%%", event.progress * 100)
                continue
            return isinstance(event, _FailedEvent), event.location

        msg = f"SSE stream closed before job finished at {status_url}"
        raise RuntimeError(msg)

    def _check_error_response(self, url: str, response: httpx.Response) -> None:
        """Check response for errors and raise appropriate exceptions"""
        if response.status_code not in (200, 202):
            logger.error(
                "Error response from %s, [%d]: %s", url, response.status_code, response.text[:200]
            )
            raise GenericFailedError()

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
            RuntimeError: For 5xx server errors
            JobFailedError: For job failures reported by the platform
            TimeoutError: If async job doesn't complete within timeout period
        """
        data: dict[str, str] = {}
        if params is not None:
            data["params"] = json.dumps(params)

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
        start_time = time.perf_counter()

        trigger_url = f"{self._platform_url}/{path}"
        response = self._httpx_client.post(
            trigger_url,
            files=files,
            data=data,
            headers={"Prefer": "respond-async"},
            timeout=self._default_timeout,
        )
        self._check_error_response(trigger_url, response)

        # Job should be accepted (202)
        assert response.status_code == 202
        status_url = response.headers["Location"]
        logger.info("Job started, status URL: %s", status_url)

        # Wait for completion via SSE
        is_failed, result_url = self._wait_for_job(status_url)
        elapsed = time.perf_counter() - start_time

        # Job is failed, fetch error details and raise
        if is_failed:
            logger.info("Platform operation [%s/%s] failed after %.2fs", path, method, elapsed)
            result_response = self._httpx_client.get(result_url, timeout=self._default_timeout)
            self._check_error_response(result_url, result_response)
            job = result_response.json()
            logger.error("Job failed with error: %s", json.dumps(job["error"], indent=2))
            raise GenericFailedError()

        # Fetch final result
        accept_header = {
            "Accept": {
                AcceptFormat.BYTES: "application/octet-stream",
                AcceptFormat.JSON: "application/json",
            }[accept_format]
        }
        result_response = self._httpx_client.get(
            result_url, headers=accept_header, timeout=self._default_timeout
        )
        self._check_error_response(result_url, result_response)
        logger.info("Platform operation [%s/%s] completed in %.2fs", path, method, elapsed)
        return result_response
