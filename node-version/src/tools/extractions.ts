import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';
import { handleToolError } from '../errors.js';
import { singleFileInputSchema } from '../models.js';

function _successResult(
  outputFilename: string,
  extra?: Record<string, unknown>,
): {
  structuredContent: Record<string, unknown>;
  content: [{ type: 'text'; text: string }];
} {
  const result = { outputFilename, ...extra };
  return {
    structuredContent: result,
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
  };
}

export function register(server: McpServer, context: AppContext): void {
  server.registerTool(
    'get_pdf_metadata',
    {
      description: 'Use this tool when the user asks for the metadata of a PDF file.',
      inputSchema: singleFileInputSchema.shape,
      annotations: { destructiveHint: true },
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);
        const metadata = await platformHandler.getPdfMetadata(inputBytes);
        const outputPath = filesHandler.write(args.inputPath, metadata, {
          stemSuffix: 'metadata',
          ext: 'json',
        });

        return _successResult(path.basename(outputPath));
      } catch (err) {
        return handleToolError('get_pdf_metadata', err);
      }
    },
  );

  server.registerTool(
    'extract_pdf_forms',
    {
      description: 'Use this tool to extract form fields from a PDF file.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        language: z.string().default('en').describe('Language code for form extraction'),
      },
      annotations: { destructiveHint: true },
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);
        const result = await platformHandler.extractPdfData(inputBytes, 'forms', {
          language: args.language,
        });
        const outputPath = filesHandler.write(args.inputPath, result, {
          stemSuffix: 'forms',
          ext: 'json',
        });

        return _successResult(path.basename(outputPath), { dataType: 'forms' });
      } catch (err) {
        return handleToolError('extract_pdf_forms', err);
      }
    },
  );

  server.registerTool(
    'extract_pdf_tables',
    {
      description: 'Use this tool to extract tables from a PDF file.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        pageIndices: z
          .array(z.number().int().min(0))
          .optional()
          .describe('Zero-based page indices to extract from'),
      },
      annotations: { destructiveHint: true },
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);
        const params = args.pageIndices !== undefined ? { pageIndices: args.pageIndices } : {};
        const result = await platformHandler.extractPdfData(inputBytes, 'tables', params);
        const outputPath = filesHandler.write(args.inputPath, result, {
          stemSuffix: 'tables',
          ext: 'json',
        });

        return _successResult(path.basename(outputPath), { dataType: 'tables' });
      } catch (err) {
        return handleToolError('extract_pdf_tables', err);
      }
    },
  );

  server.registerTool(
    'extract_pdf_text',
    {
      description: 'Use this tool to extract text from a PDF file.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        pageIndices: z
          .array(z.number().int())
          .optional()
          .describe('Zero-based page indices to extract from'),
        readingOrder: z
          .boolean()
          .default(false)
          .describe('Whether to use reading order for text extraction'),
      },
      annotations: { destructiveHint: true },
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);
        const params: { readingOrder: boolean; pageIndices?: number[] } = {
          readingOrder: args.readingOrder,
        };
        if (args.pageIndices !== undefined) {
          params.pageIndices = args.pageIndices;
        }
        const resultBuffer = await platformHandler.extractPdfData(inputBytes, 'text', params);

        const extractedText = JSON.parse(resultBuffer.toString()) as string;
        const wordCount = extractedText.split(/\s+/).filter((w) => w.length > 0).length;
        const characterCount = extractedText.length;

        const outputPath = filesHandler.write(args.inputPath, Buffer.from(extractedText), {
          stemSuffix: 'text',
          ext: 'txt',
        });

        return _successResult(path.basename(outputPath), { wordCount, characterCount });
      } catch (err) {
        return handleToolError('extract_pdf_text', err);
      }
    },
  );

  server.registerTool(
    'extract_pdf_accessibility',
    {
      description: 'Use this tool to extract accessibility data from a PDF file.',
      inputSchema: singleFileInputSchema.shape,
      annotations: { destructiveHint: true },
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);
        const result = await platformHandler.extractPdfData(inputBytes, 'accessibility', {});
        const outputPath = filesHandler.write(args.inputPath, result, {
          stemSuffix: 'accessibility',
          ext: 'json',
        });

        return _successResult(path.basename(outputPath), { dataType: 'accessibility' });
      } catch (err) {
        return handleToolError('extract_pdf_accessibility', err);
      }
    },
  );

  server.registerTool(
    'search_text_in_pdf',
    {
      description:
        'Use this tool to search for specific text strings in a PDF and get their locations. ' +
        'Returns a JSON file with bounding box coordinates for each match.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        texts: z.array(z.string()).min(1).describe('List of text strings to search for in the PDF'),
      },
      annotations: { destructiveHint: true },
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);
        const resultBuffer = await platformHandler.extractTextBoundingBoxes(inputBytes, args.texts);

        const parsed = JSON.parse(resultBuffer.toString()) as { textBoxes: { text: string }[] };
        const totalMatches = parsed.textBoxes.length;
        const uniqueTextsFound = new Set(parsed.textBoxes.map((b) => b.text)).size;

        const outputPath = filesHandler.write(args.inputPath, resultBuffer, {
          stemSuffix: 'search',
          ext: 'json',
        });

        return _successResult(path.basename(outputPath), { totalMatches, uniqueTextsFound });
      } catch (err) {
        return handleToolError('search_text_in_pdf', err);
      }
    },
  );
}
