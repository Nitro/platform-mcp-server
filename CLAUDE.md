# Nitro MCP

MCP server connecting Claude Desktop to Nitro's Document Intelligence Platform API, enabling PDF processing tools (file management, transformations, conversions, PII redaction) through natural language.

## Architecture

- `app/server.py` — FastMCP server entry point and tool registration
- `app/context.py` — `AppContext` dependency injection container
- `app/config/` — Pydantic-based environment configuration
- `app/client/` — HTTPX-based `PlatformApiClient` and `PlatformHandler`
- `app/tools/` — MCP tool implementations: `file_management.py`, `transformations.py`, `conversion.py`
- `tests/` — pytest test suite mirroring `app/` structure

The style guide is symlinked from the `doc-intelligence-api` repo — if missing, run:
`ln -s ../doc-intelligence-api/style-guide.md style-guide.md`

## Dependencies & Environment

- Use `uv add <package>` to add dependencies, `uv run <cmd>` to run commands
- Environment variables (e.g. `NITRO_AUTH_TOKEN`) may be stored in a `.env` file at the project root

## Commands

- `task run` — Start the MCP server
- `task test` — Run all tests with coverage (`uv run pytest` also works)
- `task check` — Run all quality checks (lint + types + lock)
- `task check-lint` — Ruff linting only
- `task check-types` — Pyright type checking only
- `task autoformat` — Auto-fix linting issues
- `task pre-commit` — Run all pre-commit hooks
- `task build-binary` — Build standalone binary with PyInstaller

## Python

This codebase is **fully typed**. Every function, method, and variable must have explicit type annotations — no exceptions. Pyright strict mode is the enforcer; treat any type error as a build failure.

- Python 3.14 — DO NOT USE `from __future__ import annotations` (not needed)
- DO NOT USE string types in annotations (not needed in Python 3.14)
- Use `X | Y` over `Union[X, Y]`, `X | None` over `Optional[X]`
- Use PEP 695 generic syntax (`def foo[T](x: T) -> T`) over `TypeVar`
- Use PEP 695 `type Foo = ...` over `TypeAlias`
- Use `@typing.override` where applicable
- Line length: 100 characters

## Code Quality

After making code changes, use the **ruff**, **pyright**, and **pytest** subagents to verify correctness.

- `# noqa: XXXX` is a last resort, not the default
- `# type: ignore` / `# pyright: ignore` requires explicit user permission
- Strike a balance between safety and utility — do not over-test
  - When testing MCP tool calls, assert both the structured content return and all mocked handlers/clients via `assert_called_once_with` or similar
  - Mocks must be created with `mocker.create_autospec(Thing, instance=True, spec_set=True)` where `mocker` is a `MockerFixture`

## Style Guide

Read @./style-guide.md before making any code changes.
