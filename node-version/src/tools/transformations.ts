import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DESTRUCTIVE, NON_DESTRUCTIVE } from './annotations.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';
import { handleToolError, UserFacingError } from '../errors.js';
import { singleFileInputSchema } from '../models.js';
import { ContentType } from '../client/enums.js';
import type {
  CompressionParams,
  OcrParams,
  OptimizationParams,
  PageRotation,
  PdfMetadata,
  WatermarkParams,
} from '../handlers/platformHandler.js';

const _IMAGE_CONTENT_TYPES: Partial<Record<string, ContentType>> = {
  jpg: ContentType.JPEG,
  jpeg: ContentType.JPEG,
  png: ContentType.PNG,
  tiff: ContentType.TIFF,
  tif: ContentType.TIFF,
  bmp: ContentType.BMP,
  gif: ContentType.GIF,
  svg: ContentType.SVG,
};

function _imageContentTypeFromPath(imagePath: string): ContentType {
  const ext = path.extname(imagePath).replace(/^\./, '').toLowerCase();
  const contentType = _IMAGE_CONTENT_TYPES[ext];
  if (contentType === undefined) {
    throw new UserFacingError(
      `Unsupported image format: .${ext}. Supported formats: jpg, jpeg, png, tiff, bmp, gif, svg.`,
    );
  }
  return contentType;
}

const _PDF_PERMISSION_VALUES = [
  'print',
  'modify',
  'copy',
  'annotate',
  'form',
  'assemble',
  'print-hq',
] as const;

function _parsePageRangesForSplit(pageRanges: string[]): number[][] {
  return pageRanges.map((rangeStr) => {
    const trimmed = rangeStr.trim();
    if (trimmed.includes('-')) {
      const [startStr = '', endStr = ''] = trimmed.split('-', 2);
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || start > end || start <= 0) {
        throw new UserFacingError(
          `Invalid page range: ${trimmed}. Pages are 1-indexed and start must be <= end.`,
        );
      }
      return Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
    } else {
      const pageNum = parseInt(trimmed, 10);
      if (isNaN(pageNum) || pageNum <= 0) {
        throw new UserFacingError(`Invalid page number: ${trimmed}. Pages start from 1.`);
      }
      return [pageNum - 1];
    }
  });
}

function _parsePageNumbers(pageNumbers: string[]): number[] {
  const indices: number[] = [];
  for (const part of pageNumbers) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [startStr = '', endStr = ''] = trimmed.split('-', 2);
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || start > end || start <= 0) {
        throw new UserFacingError(
          `Invalid page range: ${trimmed}. Pages are 1-indexed and start must be <= end.`,
        );
      }
      for (let i = start; i <= end; i++) {
        indices.push(i - 1);
      }
    } else {
      const pageNum = parseInt(trimmed, 10);
      if (isNaN(pageNum) || pageNum <= 0) {
        throw new UserFacingError(`Invalid page number: ${trimmed}. Pages start from 1.`);
      }
      indices.push(pageNum - 1);
    }
  }
  return [...new Set(indices)].sort((a, b) => a - b);
}

function _successResult(
  outputFilename: string,
  extra?: Record<string, unknown>,
): { structuredContent: Record<string, unknown>; content: [{ type: 'text'; text: string }] } {
  const result = { outputFilename, ...extra };
  return {
    structuredContent: result,
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  };
}

export function register(server: McpServer, context: AppContext): void {
  server.registerTool(
    'merge_files',
    {
      description:
        'Use this tool to merge multiple PDF files into a single PDF. ' +
        'By default, PDF bookmarks (an outline entry per source document, with each ' +
        "source's existing bookmarks nested beneath) are added to the merged file; " +
        'set tableOfContents to false to skip them. No extra table-of-contents page is ' +
        'added and the page count is unchanged.',
      inputSchema: {
        inputPaths: z
          .array(z.string())
          .min(2)
          .describe(
            'Full paths to PDF files to merge. Must be at least 2 files. ' +
              'All files must be in the same directory. ' +
              "Example: ['~/Downloads/a.pdf', '~/Downloads/b.pdf']",
          ),
        tableOfContents: z
          .boolean()
          .default(true)
          .describe(
            'When true (default), add PDF bookmarks to the merged file: one outline entry ' +
              "per source document, with each source's existing bookmarks nested one level " +
              'beneath. Set to false to merge without adding bookmarks. Does not add a ' +
              'table-of-contents page or change the page count.',
          ),
      },
      annotations: NON_DESTRUCTIVE('Merge PDFs'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const fileBuffers: Buffer[] = [];
        let totalInputSizeBytes = 0;
        for (const inputPath of args.inputPaths) {
          const fileBytes = filesHandler.read(inputPath);
          fileBuffers.push(fileBytes);
          totalInputSizeBytes += fileBytes.length;
        }

        const mergedBytes = await platformHandler.mergePdfs(fileBuffers, args.tableOfContents);

        const [firstInputPath] = args.inputPaths;
        if (firstInputPath === undefined)
          throw new UserFacingError('At least 2 input paths are required.');
        const outputPath = filesHandler.write(firstInputPath, mergedBytes, {
          stemSuffix: 'merged',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath), {
          inputCount: args.inputPaths.length,
          totalInputSizeBytes,
          outputSizeBytes: mergedBytes.length,
        });
      } catch (err) {
        return handleToolError('merge_files', err);
      }
    },
  );

  server.registerTool(
    'split_pdf',
    {
      description: 'Use this tool to split a PDF into separate files by page ranges.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        pageRanges: z
          .array(z.string())
          .min(1)
          .describe('Page ranges to split (e.g., ["1-3", "5", "7-9"]). Pages are 1-indexed.'),
      },
      annotations: NON_DESTRUCTIVE('Split PDF'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const parsedRanges = _parsePageRangesForSplit(args.pageRanges);
        const inputBytes = filesHandler.read(args.inputPath);
        const zipBytes = await platformHandler.splitPdf(inputBytes, parsedRanges);

        const outputPath = filesHandler.write(args.inputPath, zipBytes, {
          stemSuffix: 'split',
          ext: 'zip',
        });

        return _successResult(path.basename(outputPath), { splitCount: parsedRanges.length });
      } catch (err) {
        return handleToolError('split_pdf', err);
      }
    },
  );

  server.registerTool(
    'rotate_pdf',
    {
      description: 'Use this tool to rotate specific pages in a PDF file.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        rotations: z
          .array(
            z.object({
              pageNumber: z.number().int().min(1).describe('Page number to rotate (1-indexed)'),
              amount: z
                .union([
                  z.literal(-270),
                  z.literal(-180),
                  z.literal(-90),
                  z.literal(90),
                  z.literal(180),
                  z.literal(270),
                ])
                .describe('Rotation amount in degrees'),
            }),
          )
          .min(1)
          .describe('List of page rotations to apply. Pages are 1-indexed.'),
      },
      annotations: NON_DESTRUCTIVE('Rotate PDF'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const pageRotations: PageRotation[] = args.rotations.map((r) => ({
          pageIndex: r.pageNumber - 1,
          amount: r.amount,
        }));

        const inputBytes = filesHandler.read(args.inputPath);
        const rotatedBytes = await platformHandler.rotatePdf(inputBytes, pageRotations);

        const outputPath = filesHandler.write(args.inputPath, rotatedBytes, {
          stemSuffix: 'rotated',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath), {
          rotationCount: pageRotations.length,
        });
      } catch (err) {
        return handleToolError('rotate_pdf', err);
      }
    },
  );

  server.registerTool(
    'protect_pdf',
    {
      description: 'Use this tool to password-protect a PDF file with optional permissions.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        ownerPassword: z.string().optional().describe('Owner password for full access (optional)'),
        userPassword: z
          .string()
          .optional()
          .describe('User password for restricted access (optional)'),
        permissions: z
          .array(z.enum(_PDF_PERMISSION_VALUES))
          .optional()
          .describe('List of permissions to grant'),
      },
      annotations: DESTRUCTIVE('Password-Protect PDF'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        if (args.ownerPassword === undefined && args.userPassword === undefined) {
          throw new UserFacingError(
            'At least one password (ownerPassword or userPassword) must be provided.',
          );
        }

        const inputBytes = filesHandler.read(args.inputPath);
        const protectedBytes = await platformHandler.protectPdf(
          inputBytes,
          args.ownerPassword,
          args.userPassword,
          args.permissions,
        );

        const outputPath = filesHandler.write(args.inputPath, protectedBytes, {
          stemSuffix: 'protected',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath), {
          hasOwnerPassword: args.ownerPassword !== undefined,
          hasUserPassword: args.userPassword !== undefined,
        });
      } catch (err) {
        return handleToolError('protect_pdf', err);
      }
    },
  );

  server.registerTool(
    'unprotect_pdf',
    {
      description: 'Use this tool to remove password protection from a PDF file.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        ownerPassword: z
          .string()
          .optional()
          .describe('Owner password to remove protection (optional)'),
        userPassword: z
          .string()
          .optional()
          .describe('User password to remove protection (optional)'),
      },
      annotations: DESTRUCTIVE('Remove PDF Password'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        if (args.ownerPassword === undefined && args.userPassword === undefined) {
          throw new UserFacingError(
            'At least one password (ownerPassword or userPassword) must be provided.',
          );
        }

        const inputBytes = filesHandler.read(args.inputPath);
        const unprotectedBytes = await platformHandler.unprotectPdf(
          inputBytes,
          args.ownerPassword,
          args.userPassword,
        );

        const outputPath = filesHandler.write(args.inputPath, unprotectedBytes, {
          stemSuffix: 'unprotected',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath));
      } catch (err) {
        return handleToolError('unprotect_pdf', err);
      }
    },
  );

  server.registerTool(
    'delete_pdf_pages',
    {
      description: 'Use this tool to delete specific pages from a PDF file.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        pageNumbers: z
          .array(z.string())
          .min(1)
          .describe(
            'Page numbers to delete (e.g., ["1", "3", "5"] or ["2", "4-6", "8"]). ' +
              'Pages are 1-indexed.',
          ),
      },
      annotations: DESTRUCTIVE('Delete PDF Pages'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const pageIndices = _parsePageNumbers(args.pageNumbers);
        const inputBytes = filesHandler.read(args.inputPath);
        const modifiedBytes = await platformHandler.deletePdfPages(inputBytes, pageIndices);

        const outputPath = filesHandler.write(args.inputPath, modifiedBytes, {
          stemSuffix: 'pages-deleted',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath), { pagesDeleted: pageIndices.length });
      } catch (err) {
        return handleToolError('delete_pdf_pages', err);
      }
    },
  );

  server.registerTool(
    'set_pdf_metadata',
    {
      description: 'Use this tool to set or update metadata properties of a PDF file.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        title: z.string().optional().describe('Document title'),
        author: z.string().optional().describe('Document author'),
        subject: z.string().optional().describe('Document subject'),
        keywords: z.string().optional().describe('Document keywords (comma-separated)'),
        creator: z.string().optional().describe('Application that created the document'),
        producer: z.string().optional().describe('Application that produced the PDF'),
        creationDate: z
          .string()
          .optional()
          .describe("Creation date in PDF format 'D:YYYYMMDDhhmmss'"),
        modDate: z
          .string()
          .optional()
          .describe("Modification date in PDF format 'D:YYYYMMDDhhmmss'"),
        trapped: z.string().optional().describe('Trapping status'),
      },
      annotations: NON_DESTRUCTIVE('Set PDF Metadata'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const metadata: PdfMetadata = {
          ...(args.title !== undefined && { title: args.title }),
          ...(args.author !== undefined && { author: args.author }),
          ...(args.subject !== undefined && { subject: args.subject }),
          ...(args.keywords !== undefined && { keywords: args.keywords }),
          ...(args.creator !== undefined && { creator: args.creator }),
          ...(args.producer !== undefined && { producer: args.producer }),
          ...(args.creationDate !== undefined && { creation_date: args.creationDate }),
          ...(args.modDate !== undefined && { mod_date: args.modDate }),
          ...(args.trapped !== undefined && { trapped: args.trapped }),
        };

        if (Object.keys(metadata).length === 0) {
          throw new UserFacingError('At least one metadata field must be provided.');
        }

        const inputBytes = filesHandler.read(args.inputPath);
        const modifiedBytes = await platformHandler.setPdfMetadata(inputBytes, metadata);

        const outputPath = filesHandler.write(args.inputPath, modifiedBytes, {
          stemSuffix: 'metadata-updated',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath), {
          fieldsUpdated: Object.keys(metadata).length,
        });
      } catch (err) {
        return handleToolError('set_pdf_metadata', err);
      }
    },
  );

  server.registerTool(
    'flatten_pdf',
    {
      description:
        'Use this tool to flatten a PDF, converting all interactive form fields and ' +
        'annotations into static, non-editable content.',
      inputSchema: singleFileInputSchema.shape,
      annotations: NON_DESTRUCTIVE('Flatten PDF'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);
        const flattenedBytes = await platformHandler.flattenPdf(inputBytes);

        const outputPath = filesHandler.write(args.inputPath, flattenedBytes, {
          stemSuffix: 'flattened',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath));
      } catch (err) {
        return handleToolError('flatten_pdf', err);
      }
    },
  );

  server.registerTool(
    'watermark_pdf',
    {
      description: 'Use this tool to add an image watermark to a PDF file.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        imagePath: z
          .string()
          .describe(
            "Full path to the watermark image file (e.g., '~/Downloads/watermark.png'). " +
              'Supported formats: JPG, JPEG, PNG, TIFF, BMP, GIF, SVG.',
          ),
        boundingBox: z
          .array(z.number())
          .length(4)
          .optional()
          .nullable()
          .describe(
            'Bounding box [x0, y0, x1, y1] in PDF points for watermark placement. ' +
              'Required unless both fitToPageWidth and fitToPageHeight are true.',
          ),
        centerOnPage: z.boolean().optional().describe('Center the watermark on the page'),
        contentDepth: z
          .enum(['above_existing', 'below_existing'])
          .optional()
          .describe('Whether to render the watermark above or below existing page content'),
        fitToPageWidth: z
          .boolean()
          .optional()
          .describe(
            'Scale watermark to fit the page width. ' +
              'Requires boundingBox for vertical positioning unless fitToPageHeight is also true.',
          ),
        fitToPageHeight: z
          .boolean()
          .optional()
          .describe(
            'Scale watermark to fit the page height. ' +
              'Requires boundingBox for horizontal positioning unless fitToPageWidth is also true.',
          ),
        flip: z
          .enum(['horizontal', 'vertical', 'both'])
          .optional()
          .nullable()
          .describe('Flip direction for the watermark'),
        opacity: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('Opacity of the watermark (0.0 to 1.0, default 1.0)'),
        pageNumbers: z
          .array(z.string())
          .optional()
          .nullable()
          .describe(
            'Page numbers to watermark (e.g., ["1", "3", "5-7"]). ' +
              'Pages are 1-indexed. Defaults to all pages.',
          ),
        rotateWithPage: z
          .boolean()
          .optional()
          .describe('Whether the watermark rotates along with page rotation'),
        rotation: z.number().optional().describe('Rotation angle for the watermark in degrees'),
      },
      annotations: NON_DESTRUCTIVE('Add Watermark'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const pageIndices =
          args.pageNumbers !== null && args.pageNumbers !== undefined
            ? _parsePageNumbers(args.pageNumbers)
            : undefined;

        const params: WatermarkParams = {
          ...(args.boundingBox !== undefined && { boundingBox: args.boundingBox }),
          ...(args.centerOnPage !== undefined && { centerOnPage: args.centerOnPage }),
          ...(args.contentDepth !== undefined && { contentDepth: args.contentDepth }),
          ...(args.fitToPageWidth !== undefined && { fitToPageWidth: args.fitToPageWidth }),
          ...(args.fitToPageHeight !== undefined && { fitToPageHeight: args.fitToPageHeight }),
          ...(args.flip !== undefined && { flip: args.flip }),
          ...(args.opacity !== undefined && { opacity: args.opacity }),
          ...(pageIndices !== undefined && { pageIndices }),
          ...(args.rotateWithPage !== undefined && { rotateWithPage: args.rotateWithPage }),
          ...(args.rotation !== undefined && { rotation: args.rotation }),
        };

        const pdfBytes = filesHandler.read(args.inputPath);
        const imageBytes = filesHandler.read(args.imagePath);
        const imageContentType = _imageContentTypeFromPath(args.imagePath);
        const watermarkedBytes = await platformHandler.watermarkPdf(
          pdfBytes,
          imageBytes,
          imageContentType,
          params,
        );

        const outputPath = filesHandler.write(args.inputPath, watermarkedBytes, {
          stemSuffix: 'watermarked',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath));
      } catch (err) {
        return handleToolError('watermark_pdf', err);
      }
    },
  );

  server.registerTool(
    'ocr_pdf',
    {
      description:
        'Use this tool to apply OCR to a PDF file, producing a searchable or editable PDF.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        language: z
          .enum([
            'english',
            'german',
            'french',
            'spanish',
            'italian',
            'finnish',
            'swedish',
            'danish',
            'norwegian',
            'dutch',
            'portuguese',
            'brazilian',
          ])
          .optional()
          .describe(
            'Language of the text in the document. Selecting the correct language improves recognition accuracy (default: english).',
          ),
        quality: z
          .enum(['low', 'medium', 'high'])
          .optional()
          .describe(
            'Trade-off between processing speed and recognition accuracy. "low" is fastest, "high" is most accurate (default: high).',
          ),
        isOutputPDFEditable: z
          .boolean()
          .optional()
          .describe(
            'When true, recognised text is rendered over the page image, making it editable. ' +
              'When false (default), text is placed behind the image, keeping the PDF searchable while preserving its visual appearance.',
          ),
        compressionLevel: z
          .enum(['low', 'medium', 'high'])
          .optional()
          .describe(
            'Compression level for the output PDF. "low" retains the best image quality, "high" produces the smallest file size (default: low).',
          ),
        pdfVersion: z
          .enum(['pdf14', 'pdf15', 'pdf16', 'pdf17'])
          .optional()
          .describe('PDF specification version for the output file (default: pdf17).'),
        pageNumbers: z
          .array(z.string())
          .optional()
          .nullable()
          .describe(
            'Page numbers to apply OCR to (e.g., ["1", "3", "5-7"]). Pages are 1-indexed. Defaults to all pages.',
          ),
      },
      annotations: NON_DESTRUCTIVE('Apply OCR'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const pageIndices =
          args.pageNumbers !== null && args.pageNumbers !== undefined
            ? _parsePageNumbers(args.pageNumbers)
            : undefined;

        const params: OcrParams = {
          ...(args.language !== undefined && { language: args.language }),
          ...(args.quality !== undefined && { quality: args.quality }),
          ...(args.isOutputPDFEditable !== undefined && {
            isOutputPDFEditable: args.isOutputPDFEditable,
          }),
          ...(args.compressionLevel !== undefined && { compressionLevel: args.compressionLevel }),
          ...(args.pdfVersion !== undefined && { PDFVersion: args.pdfVersion }),
          ...(pageIndices !== undefined && { pageIndices }),
        };

        const inputBytes = filesHandler.read(args.inputPath);
        const ocrBytes = await platformHandler.ocrPdf(inputBytes, params);

        const outputPath = filesHandler.write(args.inputPath, ocrBytes, {
          stemSuffix: 'ocr',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath));
      } catch (err) {
        return handleToolError('ocr_pdf', err);
      }
    },
  );

  server.registerTool(
    'optimize_pdf',
    {
      description: 'Use this tool to optimize a PDF file for a specific use case.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        profile: z
          .enum(['web', 'print', 'archive', 'minimal-file-size', 'mixed-raster-content'])
          .describe(
            'Optimization profile to apply:\n' +
              '- "web": Linearizes the PDF for fast web delivery; downsamples images for screen resolution. Best for online viewing and email attachments.\n' +
              '- "print": Preserves print-resolution images; optimizes for fidelity over size. Best for high-quality printing.\n' +
              '- "archive": Optimizes for archival workflows (size reduction with minimal quality loss). Note: does NOT produce ISO-compliant PDF/A output — use the pdf_to_pdfa conversion tool for that.\n' +
              '- "minimal-file-size": Aggressively downsamples images and removes redundant data to produce the smallest possible file.\n' +
              '- "mixed-raster-content": Applies MRC compression, separating text and background layers for better compression on scanned content.',
          ),
      },
      annotations: NON_DESTRUCTIVE('Optimize PDF'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const params: OptimizationParams = { profile: args.profile };
        const inputBytes = filesHandler.read(args.inputPath);
        const optimizedBytes = await platformHandler.optimizePdf(inputBytes, params);

        const outputPath = filesHandler.write(args.inputPath, optimizedBytes, {
          stemSuffix: 'optimized',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath));
      } catch (err) {
        return handleToolError('optimize_pdf', err);
      }
    },
  );

  server.registerTool(
    'compress_pdf',
    {
      description:
        'Use this tool when you just want to make a PDF smaller. It compresses a PDF to reduce its file size. ' +
        'Compress is a special case of optimization that always minimises file size — reach for it when the goal ' +
        'is simply a smaller file rather than a specific optimization profile.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        level: z
          .number()
          .int()
          .min(0)
          .max(2)
          .default(1)
          .describe(
            'Compression level controlling the trade-off between file size and quality:\n' +
              '- 0: least compression / best quality (largest file).\n' +
              '- 1: balanced compression.\n' +
              '- 2: most compression / smallest file (lowest quality).',
          ),
      },
      annotations: NON_DESTRUCTIVE('Compress PDF'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const params: CompressionParams = { level: args.level as 0 | 1 | 2 };
        const inputBytes = filesHandler.read(args.inputPath);
        const compressedBytes = await platformHandler.compressPdf(inputBytes, params);

        const outputPath = filesHandler.write(args.inputPath, compressedBytes, {
          stemSuffix: 'compressed',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath));
      } catch (err) {
        return handleToolError('compress_pdf', err);
      }
    },
  );
}
