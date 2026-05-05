# Security Policy

## Reporting a vulnerability

If you discover a security issue in the Nitro PDF Services MCP server, please report it privately:

- **Email:** security@gonitro.com
- **Subject line:** `[platform-mcp-server] Security report — <short summary>`

Include:

- A description of the issue and its impact.
- Steps to reproduce, if available (sample PDF / config / commands).
- The version of the extension you observed it on (`manifest.json` → `version`).
- Whether you intend to disclose publicly, and on what timeline.

We aim to acknowledge reports within **2 business days** and provide a status update within **10 business days**. We will coordinate disclosure with you.

Please **do not** file public GitHub issues for security reports.

## Supported versions

Only the most recent minor release is actively supported with security fixes. We strongly recommend running the latest released version.

## Scope

**In scope:**

- The published `.mcpb` extension and its bundled code.
- The OAuth flow at `auth.gonitro.com` as it relates to this client.
- Local file handling and credential storage (`~/.nitro-mcp/session.json`).

**Out of scope:**

- Issues in the Nitro Platform API itself — please report those through https://www.gonitro.com/support.
- Issues in transitive npm dependencies that have a public CVE and a maintainer-led fix in flight.
