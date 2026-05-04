import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DESTRUCTIVE, NON_DESTRUCTIVE } from './annotations.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';
import { handleToolError, UserFacingError } from '../errors.js';
import { singleFileInputSchema } from '../models.js';
import type { PageRotation, PdfMetadata } from '../handlers/platformHandler.js';

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
      description: 'Use this tool to merge multiple PDF files into a single PDF.',
      inputSchema: {
        inputPaths: z
          .array(z.string())
          .min(2)
          .describe(
            'Full paths to PDF files to merge. Must be at least 2 files. ' +
              'All files must be in the same directory. ' +
              "Example: ['~/Downloads/a.pdf', '~/Downloads/b.pdf']",
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

        const mergedBytes = await platformHandler.mergePdfs(fileBuffers);

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
    'compress_file',
    {
      description: 'Use this tool to compress a PDF file to reduce its size.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        level: z
          .enum(['light', 'medium', 'heavy'])
          .default('medium')
          .describe('Compression level: "light", "medium", or "heavy"'),
      },
      annotations: NON_DESTRUCTIVE('Compress PDF'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const originalBytes = filesHandler.read(args.inputPath);
        const originalSizeBytes = originalBytes.length;

        const compressedBytes = await platformHandler.compressPdf(originalBytes, args.level);
        const compressedSizeBytes = compressedBytes.length;
        const reductionPercent =
          Math.round(((originalSizeBytes - compressedSizeBytes) / originalSizeBytes) * 1000) / 10;

        const outputPath = filesHandler.write(args.inputPath, compressedBytes, {
          stemSuffix: `compressed-${args.level}`,
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath), {
          originalSizeBytes,
          compressedSizeBytes,
          reductionPercent,
        });
      } catch (err) {
        return handleToolError('compress_file', err);
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
}
