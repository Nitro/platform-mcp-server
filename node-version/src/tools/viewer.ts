/*
  viewer.ts — Render a PDF in the Nitro reader, inline inside Claude.

  The viewer is Nitro's `nitro-pdf-reader` web component (frontend repo,
  public-reader app), folded into ONE self-contained HTML by
  `scripts/inline-viewer.mjs` and served as an MCP-App resource. The sandbox
  has no origin and blocks all network, so everything (Pdfium WASM, worker,
  Kendo theme, fonts) is inlined and the PDF bytes travel over the MCP
  transport, never HTTP:
    1. `view_pdf` is an MCP-App tool. Its result carries `_meta.ui.resourceUri`,
       so the host mounts the viewer, and `content[0].text` is JSON
       `{ filePath, filename }` which the viewer reads on launch.
    2. The viewer calls `get_pdf_for_viewer` back through the MCP bridge
       (see `scripts/viewer-bridge.js`) to receive the PDF bytes as base64.
    3. `save_pdf_edits` is a stub awaiting round-trip support (the component
       does not yet expose a save event).
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import type { AppContext } from '../context.js';
import { NON_DESTRUCTIVE } from './annotations.js';

const RESOURCE_URI = 'ui://nitro-pdf-viewer/app';

// The viewer's @font-face rules reference IBM Plex (Sans/Mono) woff2 files on
// fonts.gstatic.com. The inliner embeds those as data: URLs (offline-first) but
// keeps the gstatic URL as a fallback src. Allowlisting the origin here maps to
// the sandbox CSP font-src directive, so the fallback can still load if the host
// blocks data: fonts. resourceDomains → img-/script-/style-/font-/media-src.
const _VIEWER_CSP = {
  resourceDomains: ['https://fonts.gstatic.com', 'https://fonts.googleapis.com'],
} as const;

// Minimum inline height (px). The viewer auto-reports its content height to the
// host via `sendSizeChanged`; giving the flex shell a min-height floors that
// reported value so the PDF page area gets a usable amount of vertical space.
const MIN_VIEWER_HEIGHT_PX = 720;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Injected to floor the inline viewport height. The nitro-pdf-reader element
// uses height:100vh; without a floor, the bridge's auto-resize can settle on a
// tiny height before content lays out. Target the element + document.
const _HEIGHT_OVERRIDE_STYLE = `<style>html,body,nitro-pdf-reader{min-height:${String(MIN_VIEWER_HEIGHT_PX)}px;}</style>`;

// Load the prebuilt single-file viewer (built by scripts/inline-viewer.mjs).
// Copied from src/assets/ to dist/assets/ by build.mjs, so resolve against both.
function _loadViewerHtml(): string {
  const candidates = [
    path.resolve(__dirname, 'assets', 'mcp-app.html'),
    path.resolve(__dirname, '..', 'assets', 'mcp-app.html'),
    path.resolve(__dirname, '..', 'src', 'assets', 'mcp-app.html'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const html = fs.readFileSync(candidate, 'utf-8');
      // Inject the height override last in <head> so it wins over bundle CSS.
      return html.includes('</head>')
        ? html.replace('</head>', `${_HEIGHT_OVERRIDE_STYLE}</head>`)
        : _HEIGHT_OVERRIDE_STYLE + html;
    }
  }
  return '<!DOCTYPE html><html><body><p>Viewer asset (mcp-app.html) not found.</p></body></html>';
}

export function register(server: McpServer, context: AppContext): void {
  // ── The viewer UI resource ────────────────────────────────────────────────
  registerAppResource(
    server,
    'Nitro PDF Viewer',
    RESOURCE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: 'Self-contained Nitro PDF reader (Pdfium WASM inlined)',
      _meta: { ui: { csp: _VIEWER_CSP } },
    },
    () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: _loadViewerHtml(),
          // Content-item _meta.ui takes precedence over the listing-level value.
          _meta: { ui: { csp: _VIEWER_CSP } },
        },
      ],
    }),
  );

  // ── 1. Launch tool — mounts the viewer and hands it the file to open ──────
  registerAppTool(
    server,
    'view_pdf',
    {
      description:
        'Render a PDF in the Nitro viewer directly inside the conversation (no browser ' +
        'popup, no network, no second login). Provide the absolute filePath (use ' +
        'list_files to resolve it first). This is the preferred way to show a PDF to ' +
        'the user.',
      inputSchema: {
        filePath: z.string().describe('Absolute path to the PDF file, or a path starting with ~.'),
        fileName: z.string().optional().describe('Display name, e.g. "contract.pdf".'),
      },
      annotations: NON_DESTRUCTIVE('View PDF'),
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    ({ filePath, fileName }) => {
      const filename = fileName ?? path.basename(filePath);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ filePath, filename }) }],
      };
    },
  );

  // ── 2. Byte provider — the viewer calls this back over the MCP bridge ─────
  server.registerTool(
    'get_pdf_for_viewer',
    {
      description:
        'Internal: returns the PDF bytes (base64) for the viewer. Called by the ' +
        'viewer itself — not normally invoked directly.',
      inputSchema: {
        filePath: z.string().describe('Absolute path to the PDF file, or a path starting with ~.'),
      },
      annotations: NON_DESTRUCTIVE('Get PDF For Viewer'),
    },
    ({ filePath }) => {
      const bytes = context.filesHandler.read(filePath);
      const payload = {
        pdfBytes: bytes.toString('base64'),
        filename: path.basename(filePath),
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
    },
  );

  // ── 3. Save stub — round-trip support pending (component save event) ──────
  server.registerTool(
    'save_pdf_edits',
    {
      description:
        'Internal: persists viewer edits (e.g. page rotations). Stub — not yet implemented.',
      inputSchema: {
        filePath: z.string().describe('Absolute path to the PDF file.'),
        rotations: z
          .record(z.string(), z.number())
          .optional()
          .describe('Map of page index → rotation in degrees.'),
      },
      annotations: NON_DESTRUCTIVE('Save PDF Edits'),
    },
    ({ filePath }) => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            outputFilename: path.basename(filePath),
            note: 'Stub — edits are not yet persisted.',
          }),
        },
      ],
    }),
  );
}
