# Claude Desktop Configuration Guide

This guide explains how to configure Claude Desktop to use the Nitro MCP server.

## Prerequisites

- Claude Desktop installed
- Nitro MCP binary downloaded and installed
- Nitro Platform API authentication token

## Installation Steps

### 1. Install the Binary

**macOS/Linux:**
```bash
# Download the latest release
# (Replace URL with actual release URL)
curl -L -o nitro-mcp https://github.com/gonitro/platform-mcp-server/releases/latest/download/nitro-mcp-macos-arm64

# Make executable
chmod +x nitro-mcp

# Move to PATH
sudo mv nitro-mcp /usr/local/bin/
```

**Windows:**
1. Download `nitro-mcp.exe` from the latest release
2. Move to a permanent location (e.g., `C:\Program Files\Nitro\`)
3. Note the full path for configuration

### 2. Configure Claude Desktop

Claude Desktop's MCP configuration file is located at:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Edit this file and add the Nitro MCP server configuration:

**macOS/Linux Example:**
```json
{
  "mcpServers": {
    "nitro-mcp": {
      "command": "/usr/local/bin/nitro-mcp",
      "env": {
        "NITRO_AUTH_TOKEN": "your-api-token-here",
        "PLATFORM_API_URL": "https://api.gonitrodev.com/idp/platform",
        "NITRO_MCP_WORKSPACE": "/Users/yourname/nitro_mcp_workspace"
      }
    }
  }
}
```

**Windows Example:**
```json
{
  "mcpServers": {
    "nitro-mcp": {
      "command": "C:\\Program Files\\Nitro\\nitro-mcp.exe",
      "env": {
        "NITRO_AUTH_TOKEN": "your-api-token-here",
        "PLATFORM_API_URL": "https://api.gonitrodev.com/idp/platform",
        "NITRO_MCP_WORKSPACE": "C:\\Users\\yourname\\nitro_mcp_workspace"
      }
    }
  }
}
```

### 3. Configuration Options

#### Required

- **`NITRO_AUTH_TOKEN`**: Your Nitro Platform API authentication token

#### Optional

- **`PLATFORM_API_URL`**: Platform API endpoint
  - Default: `https://api.gonitrodev.com/idp/platform`

- **`NITRO_MCP_WORKSPACE`**: Local folder for PDF files
  - Default: `~/nitro_mcp_workspace` (macOS/Linux) or `%USERPROFILE%\nitro_mcp_workspace` (Windows)
  - This is where you'll place PDFs to process and where outputs will be saved

### 4. Restart Claude Desktop

After saving the configuration file, restart Claude Desktop for the changes to take effect.

## Verification

Once Claude Desktop restarts, you can verify the server is working:

1. Open a new conversation in Claude Desktop
2. Ask Claude: "What MCP servers are available?"
3. You should see "Nitro MCP" listed
4. Try accessing the welcome message: "Show me the Nitro MCP welcome resource"

## Troubleshooting

### Server Not Appearing

- **Check configuration file syntax**: Ensure the JSON is valid (use a JSON validator)
- **Verify binary path**: Make sure the `command` path points to the actual binary location
- **Check permissions**: Ensure the binary is executable (`chmod +x` on macOS/Linux)

### Authentication Errors

- **Verify auth token**: Ensure `NITRO_AUTH_TOKEN` is set correctly in the configuration
- **Check token validity**: Confirm your token hasn't expired

### Workspace Issues

- **Folder permissions**: Ensure the workspace folder is writable
- **Path format**: Use absolute paths, not relative paths or `~` (expand to full path)

### View Server Logs

On macOS, Claude Desktop logs are in:
```
~/Library/Logs/Claude/
```

Check `mcp-server-nitro-mcp.log` for detailed error messages.

## Development Setup

For developers working on the MCP server:

```json
{
  "mcpServers": {
    "nitro-mcp-dev": {
      "command": "uv",
      "args": ["run", "nitro-mcp"],
      "cwd": "/path/to/platform-mcp-server",
      "env": {
        "NITRO_AUTH_TOKEN": "dev-token",
        "NITRO_MCP_WORKSPACE": "/tmp/nitro-mcp-dev"
      }
    }
  }
}
```

This runs the server directly from source using `uv run`.
