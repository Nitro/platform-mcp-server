# Nitro MCP

MCP server for Nitro's Document Intelligence Platform, enabling PDF processing tools directly in Claude Desktop.

## Overview

Nitro MCP provides a Model Context Protocol (MCP) server that connects Claude Desktop to Nitro's Document Intelligence Platform API. Users can perform advanced PDF operations through natural conversation with Claude.

**Current Status:** Infrastructure setup complete. PDF processing tools will be added in upcoming releases.

## Quick Start

### For End Users (Binary Installation)

1. **Download the binary** for your platform from [Releases](https://github.com/gonitro/platform-mcp-server/releases)

2. **Install the binary:**

   **macOS/Linux:**
   ```bash
   chmod +x nitro-mcp
   sudo mv nitro-mcp /usr/local/bin/
   ```

   **Windows:**
   - Move `nitro-mcp.exe` to a convenient location (e.g., `C:\Program Files\Nitro\`)

3. **Configure Claude Desktop** - See [Claude Desktop Configuration Guide](docs/claude-desktop-config.md)

4. **Restart Claude Desktop** and start using Nitro MCP tools!

**Note:** No Python installation required - the binary is completely self-contained.

## Configuration

### Environment Variables

- **`NITRO_AUTH_TOKEN`** (required): Your Nitro Platform API authentication token
- **`PLATFORM_API_URL`** (optional): Platform API base URL
  - Default: `https://api.gonitrodev.com/idp/platform`
- **`NITRO_MCP_WORKSPACE`** (optional): Folder for input/output files
  - Default: `~/nitro_mcp_workspace`
- **`MCP_SERVER_VERSION`** (optional): Override server version display

### Claude Desktop Setup

Add to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nitro-mcp": {
      "command": "/usr/local/bin/nitro-mcp",
      "env": {
        "NITRO_AUTH_TOKEN": "your-api-token-here",
        "NITRO_MCP_WORKSPACE": "/Users/yourname/nitro_mcp_workspace"
      }
    }
  }
}
```

## Available Tools

**Coming Soon:**
- File management (list files)
- PDF transformations (compress, merge, split, rotate, protect, etc.)
- File conversions (PDF to/from Word, Excel, PowerPoint, images)
- Data extraction (forms, tables, text, accessibility)
- PII detection and redaction

Tools will be added incrementally in follow-up releases.

## Development

### Prerequisites

- Python 3.14+
- [uv](https://github.com/astral-sh/uv) package manager
- [Task](https://taskfile.dev/) task runner

### Setup

```bash
# Clone the repository
git clone https://github.com/gonitro/platform-mcp-server.git
cd platform-mcp-server

# Install dependencies and pre-commit hooks
task install
```

### Style Guide

The project style guide lives in [doc-intelligence-api](https://github.com/Nitro/doc-intelligence-api). It is referenced by `CLAUDE.md` and **must be symlinked** into this repo so that Claude can read it:

```bash
ln -s ../doc-intelligence-api/style-guide.md style-guide.md
```

### Running the Server (Development Mode)

```bash
# Set required environment variables
export NITRO_AUTH_TOKEN="your-token-here"

# Run the server
task run
```

### Testing

```bash
# Run all tests with coverage
task test

# Run specific test file
task test -- tests/test_config.py
```

### Code Quality Checks

```bash
# Run all checks (linting, type checking, tests)
task check

# Run individual checks
task check-lint      # Ruff linting
task check-types     # Pyright type checking
task autoformat      # Auto-fix linting issues
```

### Building

```bash
# Build Python distribution package
task build

# Build standalone binary with PyInstaller
task build-binary
```

The binary will be in `dist/nitro-mcp` (or `dist/nitro-mcp.exe` on Windows).

## Project Structure

```
platform-mcp-server/
├── platform_mcp_server/     # Source code
│   ├── server.py           # MCP server entry point
│   ├── config/             # Configuration management
│   └── client/             # Platform API client (future)
├── tests/                  # Test suite
├── docs/                   # Documentation
├── pyproject.toml          # Project configuration
├── Taskfile.yml            # Task automation
└── README.md              # This file
```
