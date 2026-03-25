# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""High-level handler for Nitro Platform API operations"""

from dataclasses import dataclass
from typing import TypedDict

import httpx

from app.client.enums import ContentType, FileFormat
from app.client.platform_client import AcceptFormat, BytesFile, PlatformApiClient


class SupportedConversionsTypedDict(TypedDict):
    """TypedDict for supported file conversions"""

    from_pdf_to: list[FileFormat]
    to_pdf_from: list[FileFormat]


SUPPORTED_CONVERSIONS: SupportedConversionsTypedDict = {
    "from_pdf_to": [
        FileFormat.DOCX,
        FileFormat.XLSX,
        FileFormat.PPTX,
        FileFormat.JPEG,
        FileFormat.PNG,
    ],
    "to_pdf_from": [
        FileFormat.DOC,
        FileFormat.DOCX,
        FileFormat.DOCM,
        FileFormat.DOTX,
        FileFormat.DOTM,
        FileFormat.XLS,
        FileFormat.XLSX,
        FileFormat.XLSM,
        FileFormat.XLTX,
        FileFormat.XLTM,
        FileFormat.PPT,
        FileFormat.PPTX,
        FileFormat.GIF,
        FileFormat.JPEG,
        FileFormat.PNG,
        FileFormat.TIFF,
        FileFormat.SVG,
        FileFormat.EPS,
        FileFormat.PSD,
        FileFormat.TXT,
        FileFormat.XML,
        FileFormat.CSV,
        FileFormat.RTF,
        FileFormat.HTML,
    ],
}


def _is_valid_conversion(file_type: FileFormat, to: FileFormat) -> bool:
    """Check if the conversion from 'from' format to 'to' format is supported"""
    return (file_type == FileFormat.PDF and to in SUPPORTED_CONVERSIONS["from_pdf_to"]) or (
        to == FileFormat.PDF and file_type in SUPPORTED_CONVERSIONS["to_pdf_from"]
    )


class ConversionNotSupportedError(Exception):
    """Exception raised when an unsupported conversion is attempted"""

    def __init__(self, from_format: FileFormat, to_format: FileFormat) -> None:
        message = f"Conversion from {from_format} to {to_format} is not supported"
        super().__init__(message)


@dataclass
class PlatformHandler:
    """High-level handler for platform document operations"""

    platform_client: PlatformApiClient

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

    def merge_pdfs(self, file_contents: list[bytes]) -> bytes:
        """
        Merge multiple PDFs into a single PDF.

        Args:
            file_contents: List of PDF file contents as bytes

        Returns:
            Merged PDF content as bytes

        Raises:
            ValueError: If file_contents is empty
            RuntimeError: If merge operation fails
        """
        if not file_contents:
            msg = "At least one PDF file is required for merging"
            raise ValueError(msg)

        # Create BytesFile objects for each PDF
        pdf_files: list[BytesFile] = []
        for i, content in enumerate(file_contents):
            pdf_file = BytesFile(
                content_type=ContentType.PDF, content=content, name=f"document_{i}.pdf"
            )
            pdf_files.append(pdf_file)

        response = self.platform_client.run(
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

    def convert_file(self, file_bytes: bytes, file_type: FileFormat, to: FileFormat) -> bytes:
        """Convert a file to a different format."""
        if not _is_valid_conversion(file_type, to):
            raise ConversionNotSupportedError(file_type, to)
        file = BytesFile(
            content_type=ContentType[file_type.value.upper()],
            content=file_bytes,
            name=f"input.{file_type.value}",
        )

        response = self.platform_client.run(
            "conversions",
            file,
            method=None,
            params={"to": to},
            accept_format=AcceptFormat.BYTES,
        )

        if response.status_code != 200:
            msg = f"Conversion failed with status code: {response.status_code}"
            raise RuntimeError(msg)

        return response.content
