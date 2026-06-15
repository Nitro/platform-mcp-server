import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { READ_ONLY } from './annotations.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';
import { handleToolError, UserFacingError } from '../errors.js';
import { outputTargetSchema, singleFileInputSchema } from '../models.js';
import { jsonResult } from './jsonOutput.js';
import {
  createFormsExcel,
  createTablesExcel,
  type FormsResult,
  type TablesResult,
} from '../utils/excelHelpers.js';

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

const REGEX_FLAGS = ['ignore-case', 'multiline', 'dot-all'] as const;

export function register(server: McpServer, context: AppContext): void {
  server.registerTool(
    'get_pdf_metadata',
    {
      description: 'Use this tool when the user asks for the metadata of a PDF file.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        outputTarget: outputTargetSchema,
      },
      annotations: READ_ONLY('Get PDF Metadata'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);
        const metadata = await platformHandler.getPdfMetadata(inputBytes);

        return jsonResult({
          outputTarget: args.outputTarget,
          data: JSON.parse(metadata.toString()),
          bytes: metadata,
          filesHandler,
          inputPath: args.inputPath,
          stemSuffix: 'metadata',
        });
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
        outputFormat: z
          .enum(['excel', 'json'])
          .default('excel')
          .describe(
            "Output format: 'excel' (always the default) or 'json' if explicitly requested",
          ),
        outputTarget: outputTargetSchema,
      },
      annotations: READ_ONLY('Extract PDF Forms'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);
        const result = await platformHandler.extractPdfData(inputBytes, 'forms', {
          language: args.language,
        });

        if (args.outputFormat === 'excel') {
          const formsResult = JSON.parse(result.toString()) as FormsResult;
          if (formsResult.fields.length === 0) {
            throw new UserFacingError('No data available to generate Excel output');
          }
          const excelBytes = await createFormsExcel(formsResult, path.basename(args.inputPath));
          const outputPath = filesHandler.write(args.inputPath, excelBytes, {
            stemSuffix: 'forms',
            ext: 'xlsx',
          });
          return _successResult(path.basename(outputPath), { dataType: 'forms' });
        }

        return jsonResult({
          outputTarget: args.outputTarget,
          data: JSON.parse(result.toString()),
          bytes: result,
          filesHandler,
          inputPath: args.inputPath,
          stemSuffix: 'forms',
          extra: { dataType: 'forms' },
        });
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
        outputFormat: z
          .enum(['excel', 'json'])
          .default('excel')
          .describe(
            "Output format: 'excel' (always the default) or 'json' if explicitly requested",
          ),
        outputTarget: outputTargetSchema,
      },
      annotations: READ_ONLY('Extract PDF Tables'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);
        const params = args.pageIndices !== undefined ? { pageIndices: args.pageIndices } : {};
        const result = await platformHandler.extractPdfData(inputBytes, 'tables', params);

        if (args.outputFormat === 'excel') {
          const tablesResult = JSON.parse(result.toString()) as TablesResult;
          if (tablesResult.tables.length === 0) {
            throw new UserFacingError('No data available to generate Excel output');
          }
          const excelBytes = await createTablesExcel(tablesResult, path.basename(args.inputPath));
          const outputPath = filesHandler.write(args.inputPath, excelBytes, {
            stemSuffix: 'tables',
            ext: 'xlsx',
          });
          return _successResult(path.basename(outputPath), { dataType: 'tables' });
        }

        return jsonResult({
          outputTarget: args.outputTarget,
          data: JSON.parse(result.toString()),
          bytes: result,
          filesHandler,
          inputPath: args.inputPath,
          stemSuffix: 'tables',
          extra: { dataType: 'tables' },
        });
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
        outputTarget: outputTargetSchema,
      },
      annotations: READ_ONLY('Extract PDF Text'),
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

        const structured: Record<string, unknown> = { wordCount, characterCount };
        if (args.outputTarget === 'inline' || args.outputTarget === 'both') {
          structured.data = extractedText;
        }
        if (args.outputTarget === 'file' || args.outputTarget === 'both') {
          const outputPath = filesHandler.write(args.inputPath, Buffer.from(extractedText), {
            stemSuffix: 'text',
            ext: 'txt',
          });
          structured.outputFilename = path.basename(outputPath);
        }

        return {
          structuredContent: structured,
          content: [{ type: 'text' as const, text: JSON.stringify(structured) }],
        };
      } catch (err) {
        return handleToolError('extract_pdf_text', err);
      }
    },
  );

  server.registerTool(
    'extract_invoice_data',
    {
      description:
        'Use this tool to extract structured invoice or expense data from a PDF, ' +
        'such as vendor details, line items, totals, and dates.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        outputTarget: outputTargetSchema,
      },
      annotations: READ_ONLY('Extract Invoice Data'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);
        const result = await platformHandler.extractExpenseData(inputBytes);

        return jsonResult({
          outputTarget: args.outputTarget,
          data: JSON.parse(result.toString()),
          bytes: result,
          filesHandler,
          inputPath: args.inputPath,
          stemSuffix: 'invoice',
        });
      } catch (err) {
        return handleToolError('extract_invoice_data', err);
      }
    },
  );

  // extract_pdf_accessibility is intentionally not registered — tool is not yet released

  server.registerTool(
    'search_text_in_pdf',
    {
      description:
        'Use this tool to search for text in a PDF and get its locations, using literal text or ' +
        'regular expression queries. Returns bounding box coordinates for each match. ' +
        'By default (outputTarget "inline") the matches are returned directly in the result; ' +
        'set outputTarget to "file" or "both" to also write them to a JSON file on disk.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        texts: z
          .array(z.string())
          .min(1)
          .describe('List of values to search for in the PDF; each value becomes one query'),
        isRegex: z
          .boolean()
          .optional()
          .describe('Treat each search value as a regular expression instead of literal text'),
        regexFlags: z
          .array(z.enum(REGEX_FLAGS))
          .optional()
          .describe(
            'Regex flags applied to every query (ignore-case, multiline, dot-all); ' +
              'only allowed when isRegex is true',
          ),
        outputTarget: outputTargetSchema,
      },
      annotations: READ_ONLY('Search Text in PDF'),
    },
    async (args) => {
      try {
        if (args.regexFlags && args.regexFlags.length > 0 && !args.isRegex) {
          throw new UserFacingError('regexFlags can only be provided when isRegex is true');
        }

        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const inputBytes = filesHandler.read(args.inputPath);
        const resultBuffer = await platformHandler.extractTextBoundingBoxes(
          inputBytes,
          args.texts,
          {
            isRegex: args.isRegex,
            regexFlags: args.regexFlags,
          },
        );

        const parsed = JSON.parse(resultBuffer.toString()) as {
          textBoxes: { query: { text: string }; matches: unknown[] }[];
        };
        const totalMatches = parsed.textBoxes.reduce(
          (count, queryResult) => count + queryResult.matches.length,
          0,
        );
        const uniqueTextsFound = new Set(
          parsed.textBoxes
            .filter((queryResult) => queryResult.matches.length > 0)
            .map((queryResult) => queryResult.query.text),
        ).size;

        return jsonResult({
          outputTarget: args.outputTarget,
          data: parsed,
          bytes: resultBuffer,
          filesHandler,
          inputPath: args.inputPath,
          stemSuffix: 'search',
          extra: { totalMatches, uniqueTextsFound },
        });
      } catch (err) {
        return handleToolError('search_text_in_pdf', err);
      }
    },
  );
}
