import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { zipSync } from 'fflate';
import { Jimp } from 'jimp';
import { register } from '../src/tools/rendering.js';
import { FileFormat } from '../src/client/enums.js';
import {
  createAppContext,
  type MockFilesHandler,
  type MockPlatformHandler,
} from './helpers/fixtures.js';
import { ToolCaller } from './helpers/toolCaller.js';
import type { FilesHandler } from '../src/handlers/filesHandler.js';
import type { PlatformHandler } from '../src/handlers/platformHandler.js';

async function _createToolCaller(
  context: ReturnType<typeof createAppContext>,
): Promise<{ caller: ToolCaller; cleanup: () => Promise<void> }> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  register(server, context);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    caller: new ToolCaller(client),
    cleanup: async (): Promise<void> => {
      await client.close();
    },
  };
}

async function _makePng(width: number, height: number): Promise<Buffer> {
  const image = new Jimp({ width, height, color: 0xff0000ff });
  return image.getBuffer('image/png');
}

function _zipOne(name: string, bytes: Buffer): Buffer {
  return Buffer.from(zipSync({ [name]: new Uint8Array(bytes) }));
}

describe('render_pdf_page tool', () => {
  let filesHandlerMock: MockFilesHandler;
  let platformHandlerMock: MockPlatformHandler;
  let caller: ToolCaller;
  let cleanup: () => Promise<void>;
  const tmpDir = '/tmp/test-dir';
  const inputPath = path.join(tmpDir, 'doc.pdf');

  beforeEach(async () => {
    filesHandlerMock = {
      read: vi.fn(),
      write: vi.fn(),
      listFiles: vi.fn(),
    };
    platformHandlerMock = {
      convertFile: vi.fn(),
      getPdfMetadata: vi.fn(),
      extractPdfData: vi.fn(),
      extractTextBoundingBoxes: vi.fn(),
      mergePdfs: vi.fn(),
      splitPdf: vi.fn(),
      rotatePdf: vi.fn(),
      protectPdf: vi.fn(),
      unprotectPdf: vi.fn(),
      deletePdfPages: vi.fn(),
      setPdfMetadata: vi.fn(),
      flattenPdf: vi.fn(),
      extractPiiBoundingBoxes: vi.fn(),
      redactPdf: vi.fn(),
      watermarkPdf: vi.fn(),
      ocrPdf: vi.fn(),
      optimizePdf: vi.fn(),
      compressPdf: vi.fn(),
      fillForms: vi.fn(),
      extractExpenseData: vi.fn(),
    };
    const context = createAppContext({
      filesHandler: filesHandlerMock as unknown as FilesHandler,
      platformHandler: platformHandlerMock as unknown as PlatformHandler,
    });
    ({ caller, cleanup } = await _createToolCaller(context));
  });

  afterEach(async () => {
    await cleanup();
    vi.restoreAllMocks();
  });

  it('renders a full page, returning an inline image and structured metadata', async () => {
    filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
    platformHandlerMock.splitPdf.mockResolvedValue(
      _zipOne('page-0.pdf', Buffer.from('single-page-pdf')),
    );
    // platform always renders at 300 DPI; use a small image as a stand-in
    const renderedPng = await _makePng(600, 800);
    platformHandlerMock.convertFile.mockResolvedValue(_zipOne('page-0.png', renderedPng));

    const result = await caller.call('render_pdf_page', {
      inputPath,
      pageIndex: 2,
      dpi: 150,
    });

    expect(filesHandlerMock.read).toHaveBeenCalledWith(inputPath);
    expect(platformHandlerMock.splitPdf).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), [[2]]);
    expect(platformHandlerMock.convertFile).toHaveBeenCalledWith(
      Buffer.from('single-page-pdf'),
      FileFormat.PDF,
      FileFormat.PNG,
    );
    // No disk writes for intermediates
    expect(filesHandlerMock.write).not.toHaveBeenCalled();

    expect(result.structuredContent).toEqual({
      pageIndex: 2,
      dpi: 150,
      widthPx: 300,
      heightPx: 400,
    });
    const content = (
      result as unknown as { content: { type: string; mimeType?: string; text?: string }[] }
    ).content;
    expect(content).toHaveLength(2);
    const [imageBlock, textBlock] = content as [
      { type: string; mimeType?: string },
      { type: string; text?: string },
    ];
    expect(imageBlock.type).toBe('image');
    expect(imageBlock.mimeType).toBe('image/png');
    expect(textBlock.type).toBe('text');
    expect(textBlock.text).toContain('150 DPI');
    expect(textBlock.text).toContain('300×400 px');
  });

  it('renders at the platform DPI without resizing when dpi=300', async () => {
    filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
    platformHandlerMock.splitPdf.mockResolvedValue(_zipOne('page-0.pdf', Buffer.from('pdf')));
    const renderedPng = await _makePng(400, 200);
    platformHandlerMock.convertFile.mockResolvedValue(_zipOne('page-0.png', renderedPng));

    const result = await caller.call('render_pdf_page', {
      inputPath,
      pageIndex: 0,
      dpi: 300,
    });

    expect(result.structuredContent).toMatchObject({ widthPx: 400, heightPx: 200, dpi: 300 });
  });

  it('crops to clipBox (in points) and reports cropped pixel dimensions', async () => {
    filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
    platformHandlerMock.splitPdf.mockResolvedValue(_zipOne('page-0.pdf', Buffer.from('pdf')));
    const renderedPng = await _makePng(600, 800);
    platformHandlerMock.convertFile.mockResolvedValue(_zipOne('page-0.png', renderedPng));

    // 72 pt × 144 pt clip at top-left → at 300 DPI: 300×600 px, then dpi=300 stays as-is
    const result = await caller.call('render_pdf_page', {
      inputPath,
      pageIndex: 0,
      dpi: 300,
      clipBox: [0, 0, 72, 144],
    });

    expect(result.structuredContent).toEqual({
      pageIndex: 0,
      dpi: 300,
      widthPx: 300,
      heightPx: 600,
      clipBox: [0, 0, 72, 144],
    });
  });

  it('rejects a clipBox that lies outside the rendered page bounds', async () => {
    filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
    platformHandlerMock.splitPdf.mockResolvedValue(_zipOne('page-0.pdf', Buffer.from('pdf')));
    const renderedPng = await _makePng(100, 100);
    platformHandlerMock.convertFile.mockResolvedValue(_zipOne('page-0.png', renderedPng));

    await caller.call(
      'render_pdf_page',
      {
        inputPath,
        pageIndex: 0,
        dpi: 150,
        clipBox: [10000, 10000, 50, 50],
      },
      { expectError: true },
    );
  });

  it('errors when the split step returns an empty archive', async () => {
    filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
    platformHandlerMock.splitPdf.mockResolvedValue(Buffer.from(zipSync({})));

    await caller.call(
      'render_pdf_page',
      { inputPath, pageIndex: 0, dpi: 150 },
      { expectError: true },
    );
    expect(platformHandlerMock.convertFile).not.toHaveBeenCalled();
  });

  it('errors when the convert step returns a multi-entry archive', async () => {
    filesHandlerMock.read.mockReturnValue(Buffer.from('pdf-bytes'));
    platformHandlerMock.splitPdf.mockResolvedValue(_zipOne('page-0.pdf', Buffer.from('pdf')));
    const png = await _makePng(10, 10);
    platformHandlerMock.convertFile.mockResolvedValue(
      Buffer.from(
        zipSync({
          'page-0.png': new Uint8Array(png),
          'page-1.png': new Uint8Array(png),
        }),
      ),
    );

    await caller.call(
      'render_pdf_page',
      { inputPath, pageIndex: 0, dpi: 150 },
      { expectError: true },
    );
  });

  it('rejects dpi above the cap', async () => {
    await caller.call(
      'render_pdf_page',
      { inputPath, pageIndex: 0, dpi: 600 },
      { expectError: true },
    );
    expect(platformHandlerMock.splitPdf).not.toHaveBeenCalled();
  });
});
