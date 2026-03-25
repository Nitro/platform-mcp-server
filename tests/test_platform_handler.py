"""Tests for PlatformHandler"""

from unittest.mock import MagicMock

import pytest
from pytest_mock import MockerFixture

from app.client import FileFormat
from app.client.enums import ContentType
from app.client.platform_client import AcceptFormat, BytesFile, PlatformApiClient
from app.handlers import ConversionNotSupportedError, PlatformHandler


@pytest.fixture(name="platform_client_mock")
def _platform_client_mock(mocker: MockerFixture) -> MagicMock:
    return mocker.create_autospec(PlatformApiClient, instance=True, spec_set=True)


@pytest.fixture(name="platform_handler")
def _platform_handler(platform_client_mock: MagicMock) -> PlatformHandler:
    return PlatformHandler(platform_client_mock)


def test_merge_pdfs_calls_client(
    platform_handler: PlatformHandler,
    platform_client_mock: MagicMock,
) -> None:
    """merge_pdfs calls client with correct files and returns bytes."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"merged"
    platform_client_mock.run.return_value = mock_response

    result = platform_handler.merge_pdfs([b"pdf-1", b"pdf-2"])

    assert result == b"merged"
    platform_client_mock.run.assert_called_once_with(
        "transformations",
        [
            BytesFile(content_type=ContentType.PDF, content=b"pdf-1", name="document_0.pdf"),
            BytesFile(content_type=ContentType.PDF, content=b"pdf-2", name="document_1.pdf"),
        ],
        method="merge",
        params={},
        accept_format=AcceptFormat.BYTES,
    )


def test_merge_pdfs_empty_list_raises(platform_handler: PlatformHandler) -> None:
    """merge_pdfs raises ValueError when given an empty list."""
    with pytest.raises(ValueError, match="At least one PDF file is required"):
        platform_handler.merge_pdfs([])


def test_convert_file_calls_client(
    platform_handler: PlatformHandler,
    platform_client_mock: MagicMock,
) -> None:
    """convert_file calls client with correct args and returns bytes."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"converted"
    platform_client_mock.run.return_value = mock_response

    result = platform_handler.convert_file(b"pdf-content", FileFormat.PDF, FileFormat.DOCX)

    assert result == b"converted"
    platform_client_mock.run.assert_called_once_with(
        "conversions",
        BytesFile(content_type=ContentType.PDF, content=b"pdf-content", name="input.pdf"),
        method=None,
        params={"to": FileFormat.DOCX},
        accept_format=AcceptFormat.BYTES,
    )


def test_convert_file_unsupported_raises(platform_handler: PlatformHandler) -> None:
    """convert_file raises ConversionNotSupportedError for unsupported conversions."""
    with pytest.raises(ConversionNotSupportedError):
        platform_handler.convert_file(b"pdf-content", FileFormat.PDF, FileFormat.PDF)
