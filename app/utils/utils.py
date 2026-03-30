# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Shared utilities for HTTP response handling"""

import logging

import httpx

logger = logging.getLogger("PlatformAPI")


class GenericFailedError(Exception):
    """Raised when a platform operation fails due to a developer or platform issue."""

    def __init__(self) -> None:
        super().__init__(
            "Platform operation failed. Try again or contact Nitro support if the issue persists."
        )


def check_http_response(response: httpx.Response) -> None:
    """Raise GenericFailedError if the response status is not 200 or 202."""
    if response.status_code not in (200, 202):
        logger.error(
            "Error response from %s, [%d]: %s",
            response.url,
            response.status_code,
            response.text[:200],
        )
        raise GenericFailedError()
