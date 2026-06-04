/*
  routes.ts — HTTP route handlers for the PDF viewer server.

  Three routes:
    GET  /           → serve the viewer HTML app
    GET  /pdf        → read a local PDF and stream bytes to the browser
    POST /save       → apply rotations to the PDF and write the result to disk

  Why separate from server.ts?
  This file only cares about HTTP request/response logic. server.ts handles
  the Express app lifecycle (start, stop, port). Keeping them separate makes
  each easier to read and test independently.
*/

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express, Request, Response } from 'express';
import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { UserFacingError } from '../errors.js';

// ── Path helpers ─────────────────────────────────────────────────────────────

// __dirname doesn't exist in ES Modules (the "type": "module" in package.json).
// This is the standard ES Module replacement: derive the directory of *this* file.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
  _findViewerApp — locate the viewer-app/ directory in both environments:

    Dev  (tsx src/index.ts)  : __dirname = node-version/src/viewer
                               → ../../viewer-app = node-version/viewer-app ✓

    Bundle (dist/bundle.cjs) : __dirname = node-version/dist
                               → ../viewer-app = node-version/dist/viewer-app
                               (build.mjs copies viewer-app/ into dist/ at build time)

  We try both candidates and use whichever exists on disk, so the code
  works correctly in both environments without environment variables.
*/
function _findViewerApp(): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'viewer-app'), // dev: src/viewer → ../../viewer-app
    path.resolve(__dirname, '..', 'viewer-app'), //      bundle: dist/ → ../viewer-app
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `viewer-app directory not found. Tried:\n${candidates.map((c) => `  ${c}`).join('\n')}`,
  );
}

const VIEWER_APP_DIR = _findViewerApp();

// ── Private helpers ───────────────────────────────────────────────────────────

/*
  _resolveFilePath — expand ~ and validate the file is within the user's home dir.

  Why validate? We're building a local server that reads arbitrary file paths
  from query params. Without validation, a crafted URL could read any file on
  the machine. We restrict to home dir, matching FilesHandler's policy.
*/
function _resolveFilePath(filePath: string): string {
  const home = os.homedir();

  // Expand ~ to the actual home directory path
  const expanded = filePath.startsWith('~') ? path.join(home, filePath.slice(1)) : filePath;

  const resolved = path.resolve(expanded);

  // Security: reject paths that escape the home directory
  if (!resolved.startsWith(home + path.sep) && resolved !== home) {
    throw new UserFacingError(`File path must be within the home directory.`);
  }

  if (!fs.existsSync(resolved)) {
    throw new UserFacingError(`File does not exist: ${resolved}`);
  }

  if (!fs.statSync(resolved).isFile()) {
    throw new UserFacingError(`Path is not a file: ${resolved}`);
  }

  return resolved;
}

/*
  _findAvailablePath — find a filename that doesn't already exist on disk.

  e.g. if "report-edited.pdf" exists, tries "report-edited(1).pdf", etc.
  This mirrors the same logic in FilesHandler.write() so we never silently
  overwrite an existing file.
*/
function _findAvailablePath(stem: string, ext: string, dir: string): string {
  const candidate = path.join(dir, `${stem}.${ext}`);
  if (!fs.existsSync(candidate)) return candidate;

  for (let i = 1; i <= 1000; i++) {
    const c = path.join(dir, `${stem}(${String(i)}).${ext}`);
    if (!fs.existsSync(c)) return c;
  }

  throw new Error(`Could not find an available filename for ${stem}.${ext}`);
}

// Shape of a single text box sent from the browser
interface TextBoxData {
  pageIndex: number;
  x: number; // CSS pixels from canvas left
  y: number; // CSS pixels from canvas top
  width: number; // CSS pixels
  height: number; // CSS pixels
  text: string;
  fontSize: number; // points
  scale: number; // render scale used by PDF.js (e.g. 1.5)
}

/*
  _applyEdits — apply rotations and text overlays to a PDF using pdf-lib.

  Two things happen:
    1. Rotations: for each page with a non-zero delta, the page rotation is updated.
    2. Text boxes: for each text box, we draw a white rectangle over the region
       (to mask whatever was there) then draw the new text on top.

  Coordinate conversion — why we need it:
    PDF.js renders at `scale` (e.g. 1.5), so 1 PDF point = 1.5 CSS pixels.
    PDF coordinate origin is bottom-left; canvas origin is top-left.
    So to go from canvas (x, y) to PDF (pdfX, pdfY):
      pdfX = x / scale
      pdfY = pageHeight - (y / scale) - (height / scale)
    fontSize is sent already in PDF points (divided by scale at placement time in
    the viewer), so no conversion is needed for it here.
*/
async function _applyEdits(
  pdfBytes: Buffer,
  rotations: number[],
  textBoxes: TextBoxData[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  // ── 1. Rotations ──────────────────────────────────────────────────────────
  pages.forEach((page, index) => {
    const delta = rotations[index] ?? 0;
    if (delta === 0) return;
    const currentAngle = page.getRotation().angle;
    page.setRotation(degrees((currentAngle + delta + 360) % 360));
  });

  // ── 2. Text overlays ──────────────────────────────────────────────────────
  // pdf-lib ships with a set of standard fonts (Helvetica, Times-Roman, etc.)
  // We embed Helvetica once and reuse it for all text boxes.
  const font = await pdfDoc.embedFont('Helvetica');

  for (const box of textBoxes) {
    const page = pages[box.pageIndex];
    if (!page || !box.text.trim()) continue;

    const { height: pageHeight } = page.getSize();
    const scale = box.scale;

    // Convert canvas CSS pixels → PDF points
    const pdfX = box.x / scale;
    const pdfWidth = box.width / scale;
    const pdfHeight = box.height / scale;

    // Flip Y: canvas top → PDF bottom
    // In PDF space, y=0 is at the bottom of the page.
    // box.y is measured from the top of the canvas, so:
    //   pdfY = pageHeight - (box.y / scale) - pdfHeight
    const pdfY = pageHeight - box.y / scale - pdfHeight;

    // Draw a white rectangle to mask whatever was underneath
    page.drawRectangle({
      x: pdfX,
      y: pdfY,
      width: pdfWidth,
      height: pdfHeight,
      color: rgb(1, 1, 1), // white
    });

    // Draw the user's text on top of the white rectangle.
    // box.fontSize is already in PDF points (baked at placement time in the viewer).
    const pdfFontSize = Math.min(box.fontSize, pdfHeight * 0.85);

    page.drawText(box.text, {
      x: pdfX + 3,
      y: pdfY + pdfHeight * 0.15,
      size: pdfFontSize,
      font,
      color: rgb(0.07, 0.04, 0.13), // near-black
      maxWidth: pdfWidth - 6,
    });
  }

  return pdfDoc.save();
}

// ── Route registration ────────────────────────────────────────────────────────

/*
  registerRoutes — attach all route handlers to the Express app.

  We pass the Express `app` in rather than importing it, keeping this module
  decoupled from how the app is created (easier to test).
*/
export function registerRoutes(app: Express): void {
  // ── GET / ────────────────────────────────────────────────────────────────
  // Serve the viewer HTML. sendFile requires an absolute path.
  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.join(VIEWER_APP_DIR, 'index.html'));
  });

  // ── GET /pdf ─────────────────────────────────────────────────────────────
  // Read a PDF from disk and send the raw bytes to the browser.
  // The browser (PDF.js) will parse and render those bytes.
  //
  // Query param: ?file=<url-encoded file path>
  app.get('/pdf', (req: Request, res: Response) => {
    const filePath = req.query.file;

    if (typeof filePath !== 'string' || filePath.length === 0) {
      res.status(400).send('Missing ?file= query parameter');
      return;
    }

    try {
      const resolved = _resolveFilePath(filePath);
      const pdfBytes = fs.readFileSync(resolved);

      // Tell the browser this is a PDF so it doesn't try to render it as HTML
      res.setHeader('Content-Type', 'application/pdf');
      res.send(pdfBytes);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).send(message);
    }
  });

  // ── POST /save ───────────────────────────────────────────────────────────
  // Receive edit instructions from the viewer, apply them, write to disk.
  //
  // Request body (JSON):
  //   { filePath: string, rotations: number[], textBoxes: TextBoxData[] }
  //
  // Response (JSON):
  //   { outputPath: string }
  app.post('/save', async (req: Request, res: Response) => {
    const body = req.body as { filePath?: unknown; rotations?: unknown; textBoxes?: unknown };

    if (typeof body.filePath !== 'string') {
      res.status(400).send('filePath must be a string');
      return;
    }

    if (!Array.isArray(body.rotations) || !body.rotations.every((r) => typeof r === 'number')) {
      res.status(400).send('rotations must be an array of numbers');
      return;
    }

    const rotations: number[] = body.rotations;
    const textBoxes: TextBoxData[] = Array.isArray(body.textBoxes)
      ? (body.textBoxes as TextBoxData[])
      : [];

    try {
      const resolved = _resolveFilePath(body.filePath);
      const pdfBytes = fs.readFileSync(resolved);

      // Apply rotations + text overlays using pdf-lib
      const editedBytes = await _applyEdits(pdfBytes, rotations, textBoxes);

      // Write next to the original — never overwrite the source file
      const parsed = path.parse(resolved);
      const stem = `${parsed.name}-edited`;
      const outputPath = _findAvailablePath(stem, 'pdf', parsed.dir);

      fs.writeFileSync(outputPath, editedBytes);

      res.json({ outputPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(400).send(message);
    }
  });
}
