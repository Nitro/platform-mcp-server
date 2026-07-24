import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { unzipSync } from 'fflate';
import { Jimp } from 'jimp';
import { z } from 'zod';
import { READ_ONLY } from './annotations.js';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';
import { FileFormat } from '../client/enums.js';
import { handleToolError, UserFacingError } from '../errors.js';
import { singleFileInputSchema } from '../models.js';

const _PLATFORM_RENDER_DPI = 300;
const _MAX_DPI = 300;
const _MIN_DPI = 50;
const _DEFAULT_DPI = 150;
const _POINTS_PER_INCH = 72;

function _unzipSingleEntry(zipBytes: Buffer): Buffer {
  const entries = unzipSync(new Uint8Array(zipBytes));
  const names = Object.keys(entries);
  if (names.length === 0) {
    throw new UserFacingError('Platform returned an empty archive while rendering the page.');
  }
  if (names.length > 1) {
    throw new UserFacingError(
      `Expected single-entry archive, got ${String(names.length)} entries: ${names.join(', ')}.`,
    );
  }
  const [name] = names as [string];
  return Buffer.from(entries[name] as Uint8Array);
}

interface _ClipBoxPx {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function _clipBoxToPixels(clipBox: number[], renderDpi: number): _ClipBoxPx {
  const factor = renderDpi / _POINTS_PER_INCH;
  const [x, y, w, h] = clipBox as [number, number, number, number];
  return {
    x: Math.max(0, Math.round(x * factor)),
    y: Math.max(0, Math.round(y * factor)),
    w: Math.max(1, Math.round(w * factor)),
    h: Math.max(1, Math.round(h * factor)),
  };
}

async function _processImage(
  pngBytes: Buffer,
  targetDpi: number,
  clipBox: number[] | undefined,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const image = await Jimp.read(pngBytes);

  if (clipBox !== undefined) {
    const px = _clipBoxToPixels(clipBox, _PLATFORM_RENDER_DPI);
    const clampedW = Math.min(px.w, image.width - px.x);
    const clampedH = Math.min(px.h, image.height - px.y);
    if (clampedW <= 0 || clampedH <= 0) {
      throw new UserFacingError(
        'clipBox lies outside the rendered page bounds; check pageIndex and coordinates.',
      );
    }
    image.crop({ x: px.x, y: px.y, w: clampedW, h: clampedH });
  }

  if (targetDpi !== _PLATFORM_RENDER_DPI) {
    const scale = targetDpi / _PLATFORM_RENDER_DPI;
    const newW = Math.max(1, Math.round(image.width * scale));
    const newH = Math.max(1, Math.round(image.height * scale));
    image.resize({ w: newW, h: newH });
  }

  const bytes = await image.getBuffer('image/png');
  return { bytes, width: image.width, height: image.height };
}

export function register(server: McpServer, context: AppContext): void {
  server.registerTool(
    'render_pdf_page',
    {
      description:
        'Renders a single PDF page (or a clipped region of it) as an inline PNG image, ' +
        'returned directly in the tool result with no file written to disk. ' +
        'Useful for visually verifying redactions, inspecting layout near a detected PII box, ' +
        'or any case where the model needs to see what a page actually looks like.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        pageIndex: z.number().int().min(0).describe('Zero-based index of the page to render.'),
        dpi: z
          .number()
          .int()
          .min(_MIN_DPI)
          .max(_MAX_DPI)
          .default(_DEFAULT_DPI)
          .describe(
            `Target rendering DPI (${String(_MIN_DPI)}–${String(_MAX_DPI)}, default ${String(_DEFAULT_DPI)}). ` +
              'Higher DPI yields a sharper image at the cost of token usage; use lower values ' +
              '(100–150) for full pages and higher values (up to 300) when clipBox is provided.',
          ),
        clipBox: z
          .array(z.number())
          .length(4)
          .optional()
          .describe(
            'Optional clip region in PDF points (1/72"), top-left origin, ' +
              '[x, y, width, height]. Matches the coordinate space used by extract_pii, ' +
              'search_text_in_pdf, and redact_pdf so detection boxes can be passed through directly.',
          ),
      },
      annotations: READ_ONLY('Render PDF Page'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const pdfBytes = filesHandler.read(args.inputPath);

        const splitZipBytes = await platformHandler.splitPdf(pdfBytes, [[args.pageIndex]]);
        const singlePagePdf = _unzipSingleEntry(splitZipBytes);

        const pngZipBytes = await platformHandler.convertFile(
          singlePagePdf,
          FileFormat.PDF,
          FileFormat.PNG,
        );
        const renderedPng = _unzipSingleEntry(pngZipBytes);

        const { bytes, width, height } = await _processImage(renderedPng, args.dpi, args.clipBox);
        const base64 = bytes.toString('base64');

        const structured = {
          pageIndex: args.pageIndex,
          dpi: args.dpi,
          widthPx: width,
          heightPx: height,
          ...(args.clipBox !== undefined && { clipBox: args.clipBox }),
        };

        const summary =
          `Rendered page ${String(args.pageIndex)} at ${String(args.dpi)} DPI ` +
          `(${String(width)}×${String(height)} px${args.clipBox !== undefined ? ', clipped' : ''}).`;

        return {
          structuredContent: structured,
          content: [
            { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
            { type: 'text' as const, text: summary },
          ],
        };
      } catch (err) {
        return handleToolError('render_pdf_page', err);
      }
    },
  );
}
