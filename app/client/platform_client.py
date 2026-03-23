# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""High-level handler for Nitro Platform API operations"""

import httpx

from app.client.enums import ContentType
from app.client.platform_api import AcceptFormat, BytesFile, PlatformApiClient


class PlatformHandler:  # pylint: disable=too-few-public-methods
    """High-level handler for platform document operations"""

    def __init__(self, platform_client: PlatformApiClient) -> None:
        """
        Initialize Platform Handler with injected dependencies.

        Args:
            platform_client: Platform API client for making requests
        """
        self._platform_client = platform_client

    @classmethod
    def create(cls, base_url: str, auth_token: str, timeout: float = 120.0) -> PlatformHandler:
        """
        Factory method to create handler with all dependencies.

        Args:
            base_url: Platform API base URL
            auth_token: Bearer token for authentication
            timeout: Timeout for job completion in seconds (default 120s)

        Returns:
            PlatformHandler instance with configured dependencies
        """
        headers = {"Authorization": f"Bearer {auth_token}"}
        httpx_client = httpx.Client(headers=headers, timeout=60.0)
        platform_client = PlatformApiClient(
            _httpx_client=httpx_client,
            _platform_url=base_url,
            _job_wait_timeout=timeout,
        )
        return cls(platform_client)

    def merge_pdfs(self, file_contents: list[bytes], filenames: list[str] | None = None) -> bytes:
        """
        Merge multiple PDFs into a single PDF.

        Args:
            file_contents: List of PDF file contents as bytes
            filenames: Optional list of filenames for the PDFs

        Returns:
            Merged PDF content as bytes

        Raises:
            ValueError: If file_contents is empty
            RuntimeError: If merge operation fails
        """
        if not file_contents:
            msg = "At least one PDF file is required for merging"
            raise ValueError(msg)

        if filenames is None:
            filenames = [f"document_{i}.pdf" for i in range(len(file_contents))]

        # Create BytesFile objects for each PDF
        pdf_files: list[BytesFile] = []
        for i, content in enumerate(file_contents):
            filename = filenames[i] if i < len(filenames) else f"document_{i}.pdf"
            pdf_file = BytesFile(content_type=ContentType.PDF, content=content, name=filename)
            pdf_files.append(pdf_file)

        response = self._platform_client.run(
            "transformations",
            pdf_files,
            method="merge",
            params={},
            accept_format=AcceptFormat.BYTES,
        )

        if response.status_code != 200:
            msg = f"Merge failed with status code: {response.status_code}"
            raise RuntimeError(msg)

        return response.content
