import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NON_DESTRUCTIVE } from './annotations.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';
import { handleToolError, UserFacingError } from '../errors.js';
import { singleFileInputSchema } from '../models.js';
import type { FillFormsParams } from '../handlers/platformHandler.js';

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

function _csvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function _fieldsToCsvBytes(fields: Record<string, string>): Buffer {
  const rows = Object.entries(fields).map(
    ([name, value]) => `${_csvField(name)},${_csvField(value)}`,
  );
  return Buffer.from(rows.join('\n'), 'utf-8');
}

export function register(server: McpServer, context: AppContext): void {
  server.registerTool(
    'fill_forms',
    {
      description:
        'Use this tool to fill in form fields in a PDF document with the provided field values.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        fields: z
          .record(z.string())
          .optional()
          .describe(
            'Map of form field names to their values. ' +
              'Example: {"FirstName": "Jane", "LastName": "Doe", "Email": "jane@example.com"}',
          ),
        csvPath: z
          .string()
          .optional()
          .describe(
            'Full path to a two-column CSV file (field name, value) containing form field values. ' +
              'Must include the directory — bare filenames are not accepted. ' +
              'Provide either csvPath or fields, not both.',
          ),
        strict: z
          .boolean()
          .optional()
          .describe(
            'When true, the request fails if the input contains unknown field names or omits required fields. ' +
              'When false (default), unrecognized fields are silently ignored and only matching fields are filled.',
          ),
      },
      annotations: NON_DESTRUCTIVE('Fill PDF Form'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        if (args.fields === undefined && args.csvPath === undefined) {
          throw new UserFacingError('Either fields or csvPath must be provided.');
        }
        if (args.fields !== undefined && args.csvPath !== undefined) {
          throw new UserFacingError('Provide either fields or csvPath, not both.');
        }

        const params: FillFormsParams = {
          ...(args.strict !== undefined && { strict: args.strict }),
        };

        const csvBytes =
          args.csvPath !== undefined
            ? filesHandler.read(args.csvPath)
            : _fieldsToCsvBytes(args.fields ?? {});

        const inputBytes = filesHandler.read(args.inputPath);
        const filledBytes = await platformHandler.fillForms(inputBytes, csvBytes, params);

        const outputPath = filesHandler.write(args.inputPath, filledBytes, {
          stemSuffix: 'filled',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath));
      } catch (err) {
        return handleToolError('fill_forms', err);
      }
    },
  );
}
