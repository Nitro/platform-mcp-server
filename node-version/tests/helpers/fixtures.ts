import { vi } from 'vitest';
import type { AppContext } from '../../src/context.js';
import type { FilesHandler } from '../../src/handlers/filesHandler.js';
import type { PlatformHandler } from '../../src/handlers/platformHandler.js';

export interface MockPlatformHandler {
  convertFile: ReturnType<typeof vi.fn>;
  getPdfMetadata: ReturnType<typeof vi.fn>;
  extractPdfData: ReturnType<typeof vi.fn>;
  extractTextBoundingBoxes: ReturnType<typeof vi.fn>;
  extractPiiBoundingBoxes: ReturnType<typeof vi.fn>;
  mergePdfs: ReturnType<typeof vi.fn>;
  compressPdf: ReturnType<typeof vi.fn>;
  splitPdf: ReturnType<typeof vi.fn>;
  rotatePdf: ReturnType<typeof vi.fn>;
  protectPdf: ReturnType<typeof vi.fn>;
  unprotectPdf: ReturnType<typeof vi.fn>;
  deletePdfPages: ReturnType<typeof vi.fn>;
  setPdfMetadata: ReturnType<typeof vi.fn>;
  flattenPdf: ReturnType<typeof vi.fn>;
  redactPdf: ReturnType<typeof vi.fn>;
  watermarkPdf: ReturnType<typeof vi.fn>;
  ocrPdf: ReturnType<typeof vi.fn>;
  optimizePdf: ReturnType<typeof vi.fn>;
  extractExpenseData: ReturnType<typeof vi.fn>;
}

export interface MockFilesHandler {
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  listFiles: ReturnType<typeof vi.fn>;
}

export function createPlatformHandlerMock(): MockPlatformHandler {
  return {
    convertFile: vi.fn(),
    getPdfMetadata: vi.fn(),
    extractPdfData: vi.fn(),
    extractTextBoundingBoxes: vi.fn(),
    extractPiiBoundingBoxes: vi.fn(),
    mergePdfs: vi.fn(),
    compressPdf: vi.fn(),
    splitPdf: vi.fn(),
    rotatePdf: vi.fn(),
    protectPdf: vi.fn(),
    unprotectPdf: vi.fn(),
    deletePdfPages: vi.fn(),
    setPdfMetadata: vi.fn(),
    flattenPdf: vi.fn(),
    redactPdf: vi.fn(),
    watermarkPdf: vi.fn(),
    ocrPdf: vi.fn(),
    optimizePdf: vi.fn(),
    extractExpenseData: vi.fn(),
  };
}

export function createFilesHandlerMock(): MockFilesHandler {
  return {
    read: vi.fn(),
    write: vi.fn(),
    listFiles: vi.fn(),
  };
}

export function createAppContext(overrides: Partial<AppContext> = {}): AppContext {
  const defaultPlatformHandler = createPlatformHandlerMock() as unknown as PlatformHandler;
  const defaultFilesHandler = createFilesHandlerMock() as unknown as FilesHandler;

  return {
    platformHandler: overrides.platformHandler ?? defaultPlatformHandler,
    filesHandler: overrides.filesHandler ?? defaultFilesHandler,
  };
}
