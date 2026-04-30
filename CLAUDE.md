# Nitro MCP

MCP server connecting Claude Desktop to Nitro's Document Intelligence Platform API, enabling PDF processing tools (file management, transformations, conversions, PII redaction) through natural language.

> **The codebase was originally Python (FastMCP) but has been fully migrated to Node.js/TypeScript. All active development happens in `node-version/`. The Python code at the root is legacy and should not be modified.**

## Active Codebase — `node-version/`

- `src/server.ts` — MCP server entry point and tool registration
- `src/context.ts` — `AppContext` dependency injection container
- `src/config.ts` — Environment configuration
- `src/client/` — `PlatformApiClient` (HTTP + SSE) and enums
- `src/handlers/` — `PlatformHandler` (operations) and `FilesHandler` (local I/O)
- `src/tools/` — MCP tool implementations
- `src/auth/` — PKCE auth flow and token management
- `tests/` — Vitest test suite

## Commands

Run from the repo root using the `n:` namespace (aliased from `node-version/Taskfile.yml`):

- `task n:check` — Run all quality checks (format + types + lint). **Must pass after every code change.**
- `task n:test` — Run all tests with coverage
- `task n:autoformat` — Auto-fix formatting issues
- `task n:run` — Run the MCP server


## Rules

- **Never amend commits** — always add a new commit
- **Never force push**
- **Never push directly to `main`** — if the user asks to commit and no branch is checked out, ask whether to create one first
- **Always run `task n:check` after making code changes** and fix any errors before considering the task done
- **Never commit untracked files speculatively** — the working directory may contain scratch files, local tools, and other artefacts that must not be committed; only stage files that are directly part of the change

## TypeScript

The codebase is **fully typed**. Treat any type error as a build failure.

- No `any`, no `// @ts-ignore` without explicit user permission
- Follow existing patterns for error handling: `UserFacingError` for user-caused errors, `GenericFailedError` (with session reference code) for platform failures

## Testing

- Use Vitest (`task n:test`)
- When testing tool calls, assert both the structured return value and mock interactions
- Use `vi.spyOn` / `vi.fn()` for mocks — follow patterns in existing test files
- Use simple test values, not pseudo-realistic ones — e.g. `"file-id"` not `"00000000-0000-0000-0000-000000000000"`; for field values just use the field name, e.g. `"title"`, `"type"`
- Almost never test private methods — test via the public interface; use mock assertions to verify interactions with dependencies

## Code Conventions

- **Private before public** — define private methods/functions before the public ones that use them
- **Settings decoupling** — each class should define and accept its own settings, thus decoupled from global config
- **Always prefer awaits over promise chains** — for readability and error handling

## Sub-Agents

A `pr-review` sub-agent is defined in `.claude/agents/pr-review.md`. It runs on `claude-sonnet-4-6` and reviews the branch diff for correctness, type safety, test coverage, and conventions.

**Use it after a significant chunk of work**, before raising a PR.

## Keeping CLAUDE.md Up to Date

If you make changes that affect the architecture, commands, conventions, or any other aspect documented here, **update this file as part of the same piece of work**. Do not leave it stale.
