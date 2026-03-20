# Copyright (c) 2005-2025 Nitro Software Inc. All Rights Reserved

"""Setup functionality"""

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from setuptools import setup

if TYPE_CHECKING:
    from setuptools_scm import ScmVersion


def calver(version: ScmVersion) -> str:
    """Format CalVer value"""
    dt = version.time or datetime.now(tz=UTC)
    return f"{dt.strftime('%Y.%m.%d')}.{version.distance}"


setup(use_scm_version={"version_scheme": calver})
