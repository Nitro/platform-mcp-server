# Nitro PDF Services

MCP server connecting Claude Desktop to Nitro's Document Intelligence Platform, enabling PDF processing and document automation through natural language.

> **Anthropic Software Directory reviewers:** see [docs/REVIEWER-ACCESS.md](docs/REVIEWER-ACCESS.md) for test account details, sample files, and 18 suggested prompts covering every tool.

## Description

Nitro PDF Services brings the power of Nitro's Document Intelligence Platform directly into Claude Desktop. Perform advanced PDF operations — merging, splitting, converting, compressing, extracting data, and more — simply by describing what you want in natural language. No manual file uploads or external tools required.

## Features

- **File Management**: List and manage files in your local folders using natural language folder references
- **PDF Transformations**: Merge, split, compress, rotate, protect, flatten, and manipulate PDFs
- **File Conversions**: Convert between PDF and Word, Excel, PowerPoint, and image formats
- **Data Extraction**: Extract text, tables, form fields, metadata, and PII from PDFs
- **Dynamic Workspace**: Reference folders naturally ("files in Downloads") — no upfront configuration needed

## Installation

1. Download the latest `nitro-pdf-services-x.y.z.mcpb` from the [Releases page](https://github.com/Nitro/platform-mcp-server/releases).
2. In Claude Desktop, open **Settings → Extensions**.
3. Drag the `.mcpb` file into the Extensions panel and click **Install**.

## Authentication

Nitro PDF Services uses PKCE OAuth — no client ID or secret to manage.

1. With the extension installed, ask Claude to perform any PDF operation (e.g. "list PDFs in my Documents folder").
2. The first tool call returns an **Authentication required** message with a sign-in URL.
3. Open the URL in your browser and sign in with your Nitro account.
4. The browser confirms success and the tool call automatically retries.

A refresh token is stored at `~/.nitro-mcp/session.json` (mode 0600). To sign out, delete this file.

## Examples

**Merge multiple PDFs:**
```
Merge invoice-jan.pdf, invoice-feb.pdf, and invoice-mar.pdf from my Documents folder into one file using Nitro
```

**Convert a PDF to Word:**
```
Convert report.pdf in my Desktop folder to a Word document using Nitro
```

**Compress a large PDF:**
```
Compress presentation.pdf from Downloads with heavy compression using Nitro
```

**Extract tables from a PDF:**
```
Extract all tables from data-export.pdf in my Documents folder as Excel using Nitro
```

**Split a PDF by page range:**
```
Split contract.pdf into two files: pages 1-5 and pages 6-10 using Nitro
```

**Protect a PDF with a password:**
```
Add password protection to confidential.pdf in Desktop using Nitro
```

**Render a PDF page as an image to verify content visually:**
```
Using Nitro, render page 1 of contract.pdf in Downloads at 150 DPI so I can see it
```

## Data Handling

When you invoke a Nitro PDF Services tool, the file you specify is uploaded to Nitro's hosted Platform API at `api.gonitro.com` for processing. Results are written back to your local disk. Your OAuth refresh token is stored only on your local device at `~/.nitro-mcp/session.json`; access tokens are kept in memory and never stored server-side.

For full details on data retention, AI/ML training policy, subprocessors, and processing regions:

- [Privacy Policy](https://www.gonitro.com/legal/privacy-policy)
- [AI Policy](https://www.gonitro.com/security-compliance/artificial-intelligence)
- [Subprocessors & Subcontractors](https://www.gonitro.com/security-compliance/data-protection/subprocessors-and-subcontractors)
- [Processing of Personal Data](https://www.gonitro.com/security-compliance/data-protection/processing-of-personal-data)
- [Information Security Policy](https://www.gonitro.com/hubfs/information-security-policy.pdf)

## Troubleshooting

**"Address already in use" during sign-in** — another process is listening on the OAuth callback port. Close it and retry, or restart Claude Desktop.

**Sign-in succeeds but tool calls still fail with auth errors** — delete `~/.nitro-mcp/session.json` and retry to force a fresh sign-in.

**"You have used up your current Nitro allowance"** — wait for the rate-limit window indicated in the message, or contact your Nitro account owner.

**Extension not appearing after install** — restart Claude Desktop and check that the `.mcpb` file installed without errors in Settings → Extensions.

**Viewing logs** — on macOS, Claude Desktop logs are at `~/Library/Logs/Claude/`. The file `mcp-server-nitro-mcp.log` contains detailed output from this extension. Error messages include a reference code; include it when contacting support.

**Filing a bug** — open an issue at [https://github.com/Nitro/platform-mcp-server/issues](https://github.com/Nitro/platform-mcp-server/issues) and include the reference code from the error message.

## Privacy Policy

Your data is processed in accordance with the Nitro Privacy Policy:
[https://www.gonitro.com/legal/privacy-policy](https://www.gonitro.com/legal/privacy-policy)

## Support

For help or to report issues, visit:
[https://www.gonitro.com/support](https://www.gonitro.com/support)
