> **Legacy / archived.** This file describes the v0.9.0 Python build and no longer applies. The active codebase is `node-version/` (Node.js bundle, v0.16.0+). See `README.md` for installation and usage, and `node-version/` for development setup.

---

# Nitro MCP — Development Guide

## Prerequisites

- Python 3.14+
- [uv](https://github.com/astral-sh/uv) package manager
- [Task](https://taskfile.dev/) task runner

## Setup

```bash
# Clone the repository
git clone https://github.com/gonitro/platform-mcp-server.git
cd platform-mcp-server

# Install dependencies and pre-commit hooks
task install
```

## Style Guide

The project style guide lives in [doc-intelligence-api](https://github.com/Nitro/doc-intelligence-api). It is referenced by `CLAUDE.md` and **must be symlinked** into this repo so that Claude can read it:

```bash
ln -s ../doc-intelligence-api/style-guide.md style-guide.md
```

## Running the Server (Development Mode)

```bash
# Set required environment variables
export NITRO_AUTH_TOKEN="your-token-here"

# Run the server
task run
```

## Testing

```bash
# Run all tests with coverage
task test

# Run specific test file
task test -- tests/test_config.py
```

## Code Quality Checks

```bash
# Run all checks (linting, type checking, tests)
task check

# Run individual checks
task check-lint      # Ruff linting
task check-types     # Pyright type checking
task autoformat      # Auto-fix linting issues
```

## Building

The server is distributed as an `.mcpb` bundle using [mcpb](https://github.com/modelcontextprotocol/mcpb).

```bash
# Build the mcpb bundle (outputs mcp.mcpb in the project root)
task build
```

This runs `mcpb pack` against the project directory using the `manifest.json` at the root.

### Manifest defaults

The default `manifest.json` is configured for production use:

| Setting | Default |
|---|---|
| `NITRO_TARGET_ENV` | `prod` |
| `NITRO_AUTH_MODE` | `client-credentials` |

Users are prompted for `client_id` and `client_secret` at install time via `user_config`.

### Building for a different environment

To target a different environment, change `NITRO_TARGET_ENV` in `manifest.json` before running `task build`:

```json
"env": {
  "NITRO_TARGET_ENV": "prod",
  ...
}
```

Valid values are `dev` and `prod`.

## Project Structure

```
platform-mcp-server/
├── app/                     # Source code
│   ├── server.py            # MCP server entry point
│   ├── config/              # Configuration management
│   ├── client/              # Platform API client
│   ├── handlers/            # Request handlers
│   └── tools/               # MCP tool implementations
├── tests/                   # Test suite
├── docs/                    # Documentation
├── pyproject.toml           # Project configuration
├── Taskfile.yml             # Task automation
└── README.md                # Public-facing readme
```
