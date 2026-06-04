/*
  viewer.ts — MCP tools for the Nitro PDF inline viewer

  Implements the MCP Apps pattern (ext-apps) so the viewer renders
  as an inline panel in Claude Desktop — no Express server, no preview_start.

  Three tools:
    open_in_viewer      — the main tool with _meta.ui pointing to the ui:// resource.
                          Claude calls this; the inline panel appears automatically.
    get_pdf_for_viewer  — helper called by the React UI to fetch PDF bytes (base64).
    save_pdf_edits      — helper called by the React UI when the user clicks Save.
*/

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { PDFDocument, degrees, rgb } from 'pdf-lib';
import type { AppContext } from '../context.js';
import { handleToolError, UserFacingError } from '../errors.js';
import { NON_DESTRUCTIVE } from './annotations.js';
import { startViewerServer } from '../viewer/server.js';
import type { ViewerServer } from '../viewer/server.js';

// Express server singleton — used as fallback when MCP Apps inline rendering
// isn't supported by the host (pre-release Claude Desktop builds).
let _server: ViewerServer | null = null;
async function _getOrStartServer(): Promise<ViewerServer> {
  _server ??= await startViewerServer();
  return _server;
}

// ── Path helpers ──────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The built single-file HTML lives in mcp-viewer-app/dist/
// Works for both dev (src/tools/) and bundle (dist/) via the candidate fallback.
function _findViewerHtml(): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'mcp-viewer-app', 'dist', 'mcp-app.html'), // dev
    path.resolve(__dirname, '..', 'mcp-viewer-app', 'mcp-app.html'),                // bundle
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `Viewer HTML not found. Run: cd mcp-viewer-app && npm install && npm run build\nTried:\n${candidates.join('\n')}`,
  );
}

// ── Security helper ───────────────────────────────────────────────────────────

function _resolveFilePath(filePath: string): string {
  const home = os.homedir();
  const expanded = filePath.startsWith('~') ? path.join(home, filePath.slice(1)) : filePath;
  const resolved = path.resolve(expanded);
  if (!resolved.startsWith(home + path.sep) && resolved !== home) {
    throw new UserFacingError('File path must be within the home directory.');
  }
  if (!fs.existsSync(resolved)) throw new UserFacingError(`File does not exist: ${resolved}`);
  if (!fs.statSync(resolved).isFile()) throw new UserFacingError(`Path is not a file: ${resolved}`);
  return resolved;
}

function _findAvailablePath(stem: string, ext: string, dir: string): string {
  const candidate = path.join(dir, `${stem}.${ext}`);
  if (!fs.existsSync(candidate)) return candidate;
  for (let i = 1; i <= 1000; i++) {
    const c = path.join(dir, `${stem}(${String(i)}).${ext}`);
    if (!fs.existsSync(c)) return c;
  }
  throw new Error(`No available filename for ${stem}.${ext}`);
}

// ── pdf-lib helper ────────────────────────────────────────────────────────────

interface TextBoxData {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  scale: number;
}

async function _applyEdits(
  pdfBytes: Buffer,
  rotations: number[],
  textBoxes: TextBoxData[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  pages.forEach((page, i) => {
    const delta = rotations[i] ?? 0;
    if (delta === 0) return;
    page.setRotation(degrees((page.getRotation().angle + delta + 360) % 360));
  });

  if (textBoxes.length > 0) {
    const font = await pdfDoc.embedFont('Helvetica');
    for (const box of textBoxes) {
      const page = pages[box.pageIndex];
      if (!page || !box.text.trim()) continue;
      const { height: ph } = page.getSize();
      const pdfX = box.x / box.scale;
      const pdfW = box.width / box.scale;
      const pdfH = box.height / box.scale;
      const pdfY = ph - box.y / box.scale - pdfH;
      page.drawRectangle({ x: pdfX, y: pdfY, width: pdfW, height: pdfH, color: rgb(1, 1, 1) });
      page.drawText(box.text, {
        x: pdfX + 3,
        y: pdfY + pdfH * 0.15,
        size: Math.min(box.fontSize / box.scale, pdfH * 0.85),
        font,
        color: rgb(0.07, 0.04, 0.13),
        maxWidth: pdfW - 6,
      });
    }
  }

  return pdfDoc.save();
}

// ── Resource URI ──────────────────────────────────────────────────────────────

const VIEWER_RESOURCE_URI = 'ui://nitro-pdf-viewer/viewer.html';

// ── Tool registration ─────────────────────────────────────────────────────────

export function register(server: McpServer, context: AppContext): void {
  void context;

  // ── 1. Main tool — opens the inline viewer panel ──────────────────────────
  registerAppTool(
    server,
    'open_in_viewer',
    {
      description:
        'Open a PDF file in the Nitro inline viewer directly inside Claude. ' +
        'Use whenever the user wants to view, rotate, or inspect a PDF. ' +
        'IMPORTANT: After calling this tool, you MUST immediately and automatically do the following steps without waiting for the user: ' +
        '1. Call preview_list to check if the nitro-viewer preview server is running. ' +
        '2. If the list is empty, call preview_start with name "nitro-viewer" to start it. ' +
        '3. Call preview_eval with the returned serverId to navigate: window.location.href = viewerUrl (from the tool result). ' +
        'Do all of this silently and automatically — never ask the user to do any of these steps. Do NOT call preview_resize.',
      inputSchema: {
        filePath: z
          .string()
          .min(1)
          .describe('Absolute or ~/relative path to the PDF file. Use list_files to find it.'),
      },
      annotations: NON_DESTRUCTIVE('Open in Nitro Viewer'),
      _meta: { ui: { resourceUri: VIEWER_RESOURCE_URI } },
    },
    async (args) => {
      try {
        if (!args.filePath.toLowerCase().endsWith('.pdf')) {
          throw new UserFacingError(`"${args.filePath}" does not appear to be a PDF file.`);
        }
        const resolved = _resolveFilePath(args.filePath);
        const filename = path.basename(resolved);
        // Also start the Express server so the preview_start fallback works
        // while MCP Apps inline rendering is pending Claude Desktop support.
        const viewerServer = await _getOrStartServer();
        const viewerUrl = `${viewerServer.url}/?file=${encodeURIComponent(resolved)}`;
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ filePath: resolved, filename, viewerUrl }),
            },
          ],
        };
      } catch (err) {
        return handleToolError('open_in_viewer', err);
      }
    },
  );

  // ── 2. Helper — returns base64 PDF bytes to the React UI ─────────────────
  server.registerTool(
    'get_pdf_for_viewer',
    {
      description: 'Returns base64-encoded PDF bytes. Called by the inline viewer UI — not for direct use.',
      inputSchema: { filePath: z.string().min(1).describe('Absolute path to the PDF file.') },
      annotations: NON_DESTRUCTIVE('Get PDF bytes'),
    },
    (args) => {
      try {
        const resolved = _resolveFilePath(args.filePath);
        const bytes = fs.readFileSync(resolved);
        const b64 = bytes.toString('base64');
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ pdfBytes: b64 }) }],
        };
      } catch (err) {
        return handleToolError('get_pdf_for_viewer', err);
      }
    },
  );

  // ── 3. Helper — applies edits and saves a new file ────────────────────────
  server.registerTool(
    'save_pdf_edits',
    {
      description: 'Saves PDF edits (rotations, text overlays) to a new file. Called by the inline viewer UI — not for direct use.',
      inputSchema: {
        filePath: z.string().min(1),
        rotations: z.array(z.number()).describe('Per-page rotation deltas in degrees.'),
        textBoxes: z
          .array(
            z.object({
              pageIndex: z.number(),
              x: z.number(),
              y: z.number(),
              width: z.number(),
              height: z.number(),
              text: z.string(),
              fontSize: z.number(),
              scale: z.number(),
            }),
          )
          .optional()
          .default([]),
      },
      annotations: NON_DESTRUCTIVE('Save PDF edits'),
    },
    async (args) => {
      try {
        const resolved = _resolveFilePath(args.filePath);
        const pdfBytes = fs.readFileSync(resolved);
        const edited = await _applyEdits(pdfBytes, args.rotations, args.textBoxes);
        const parsed = path.parse(resolved);
        const outputPath = _findAvailablePath(`${parsed.name}-edited`, 'pdf', parsed.dir);
        fs.writeFileSync(outputPath, edited);
        const outputFilename = path.basename(outputPath);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ outputPath, outputFilename }) },
          ],
        };
      } catch (err) {
        return handleToolError('save_pdf_edits', err);
      }
    },
  );

  // ── 4. Register the ui:// HTML resource ──────────────────────────────────
  registerAppResource(
    server,
    'Nitro PDF Viewer',
    VIEWER_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    () => {
      let html: string;
      try {
        html = fs.readFileSync(_findViewerHtml(), 'utf-8');
      } catch {
        html = `<!DOCTYPE html><html><body><p style="font-family:sans-serif;padding:20px;color:red">
          Viewer not built. Run: <code>cd mcp-viewer-app && npm install && npm run build</code>
        </p></body></html>`;
      }
      return {
        contents: [{ uri: VIEWER_RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    },
  );
}
