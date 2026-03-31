# Nitro MCP

MCP server for Nitro's Document Intelligence Platform, enabling PDF processing tools directly in Claude Desktop.

## Overview

Nitro MCP provides a Model Context Protocol (MCP) server that connects Claude Desktop to Nitro's Document Intelligence Platform API. Users can perform advanced PDF operations through natural conversation with Claude.

**Key Features:**
- **Dynamic Workspace Management**: Specify folders naturally in conversation (e.g., "list files from Downloads")
- **Smart Path Resolution**: Works with folder names, subfolders, or full paths
- **Session Persistence**: Set workspace once, reuse for all operations in the session

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
- **`MCP_SERVER_VERSION`** (optional): Override server version display

### Workspace Management

Nitro MCP uses a **dynamic workspace** approach - no configuration required! Simply specify the folder location when you need it:

**Examples:**
- "List files from Downloads" → Uses `~/Downloads`
- "Compress files in Desktop/project" → Uses `~/Desktop/project`
- "List files from /Users/john/Documents" → Uses exact path

**How it works:**
1. First operation sets the workspace for your session
2. Subsequent operations use the same workspace automatically
3. Switch folders anytime by specifying a new location

**Common folders automatically recognized:** Downloads, Documents, Desktop, Pictures

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
        "NITRO_AUTH_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

## Available Tools

### File Management
- **list_files**: List files in a folder (supports folder names, subfolders, or full paths)

### PDF Transformations
- **merge_files**: Combine multiple PDFs into one
- **compress_file**: Reduce PDF file size (light, medium, heavy compression)
- **split_pdf**: Split PDF by page ranges into separate files
- **rotate_pdf**: Rotate specific pages by degrees
- **protect_pdf**: Add password protection and permissions
- **unprotect_pdf**: Remove password protection
- **delete_pdf_pages**: Remove specific pages from a PDF
- **set_pdf_metadata**: Update PDF metadata (title, author, subject, etc.)
- **flatten_pdf**: Make forms and annotations non-editable

### File Conversions
- **convert_file**: Convert files between formats
  - From PDF: Word, Excel, PowerPoint, images (JPG, PNG)
  - To PDF: Word, Excel, PowerPoint, images

### Data Extraction
- **get_pdf_metadata**: Extract PDF metadata properties
- **extract_pdf_forms**: Extract form fields (Excel or JSON output)
- **extract_pdf_tables**: Extract tables from PDFs (Excel or JSON output)
- **extract_pdf_text**: Extract text content with optional reading order
- **extract_pdf_accessibility**: Extract accessibility data

### Usage Examples

```
"List files from Downloads"
"Merge invoice1.pdf and invoice2.pdf from Desktop/invoices"
"Compress document.pdf with heavy compression"
"Extract tables from report.pdf in Documents"
"Convert presentation.pdf to PowerPoint in Desktop"
```

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
