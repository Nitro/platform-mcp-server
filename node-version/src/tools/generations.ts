import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NON_DESTRUCTIVE } from './annotations.js';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { getDep } from '../context.js';
import { handleToolError, UserFacingError } from '../errors.js';
import { singleFileInputSchema } from '../models.js';
import type { FillFormsParams, FormFields } from '../handlers/platformHandler.js';

const _formFieldSchema = z.object({
  pageIndex: z.number().int().min(0).describe('The 0-based page index the field belongs to.'),
  fieldType: z
    .enum(['TextBox', 'CheckBox'])
    .describe('The kind of form field to create: a text input ("TextBox") or a "CheckBox".'),
  name: z.string().min(1).describe('The unique name of the form field.'),
  boundingBox: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .describe('The field position as [x, y, width, height] in PDF points.'),
  value: z.string().optional().describe('Optional initial value for the field.'),
});

const _formFieldsSchema = z.object({
  formFields: z
    .array(_formFieldSchema)
    .describe('Flat list of form fields to materialize as real AcroForm fields.'),
});

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

function _fieldsToJsonBytes(fields: Record<string, string | number | boolean>): Buffer {
  return Buffer.from(JSON.stringify(fields), 'utf-8');
}

export function register(server: McpServer, context: AppContext): void {
  server.registerTool(
    'fill_forms',
    {
      description:
        'Use this tool to fill in form fields in a PDF document with the provided field values. ' +
        'Field values may be supplied inline or via a CSV, JSON, XFDF, or FDF data file.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        fields: z
          .record(z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe(
            'Map of form field names to their values. Values may be strings, numbers, or ' +
              'booleans (use a boolean for checkbox fields). ' +
              'Example: {"FirstName": "Jane", "Age": 30, "AgreeToTerms": true}',
          ),
        csvPath: z
          .string()
          .optional()
          .describe(
            'Full path to a two-column CSV file (field name, value) containing form field values. ' +
              'Must include the directory — bare filenames are not accepted. ' +
              'Provide exactly one of fields, csvPath, jsonPath, xfdfPath, or fdfPath.',
          ),
        jsonPath: z
          .string()
          .optional()
          .describe(
            'Full path to a JSON file mapping form field names to values ' +
              '(e.g. {"FirstName": "Jane", "LastName": "Doe"}). ' +
              'Must include the directory — bare filenames are not accepted. ' +
              'Provide exactly one of fields, csvPath, jsonPath, xfdfPath, or fdfPath.',
          ),
        xfdfPath: z
          .string()
          .optional()
          .describe(
            'Full path to an XFDF (Adobe XML Forms Data Format) file containing form field values. ' +
              'Must include the directory — bare filenames are not accepted. ' +
              'Provide exactly one of fields, csvPath, jsonPath, xfdfPath, or fdfPath.',
          ),
        fdfPath: z
          .string()
          .optional()
          .describe(
            'Full path to an FDF (Adobe Forms Data Format) file containing form field values. ' +
              'Must include the directory — bare filenames are not accepted. ' +
              'Provide exactly one of fields, csvPath, jsonPath, xfdfPath, or fdfPath.',
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

        const inputCount = [
          args.fields,
          args.csvPath,
          args.jsonPath,
          args.xfdfPath,
          args.fdfPath,
        ].filter((value) => value !== undefined).length;
        if (inputCount === 0) {
          throw new UserFacingError(
            'One of fields, csvPath, jsonPath, xfdfPath, or fdfPath must be provided.',
          );
        }
        if (inputCount > 1) {
          throw new UserFacingError(
            'Provide exactly one of fields, csvPath, jsonPath, xfdfPath, or fdfPath.',
          );
        }

        const params: FillFormsParams = {
          ...(args.strict !== undefined && { strict: args.strict }),
        };

        const dataFile: { bytes: Buffer; format: 'csv' | 'json' | 'xfdf' | 'fdf' } =
          args.csvPath !== undefined
            ? { bytes: filesHandler.read(args.csvPath), format: 'csv' }
            : args.jsonPath !== undefined
              ? { bytes: filesHandler.read(args.jsonPath), format: 'json' }
              : args.xfdfPath !== undefined
                ? { bytes: filesHandler.read(args.xfdfPath), format: 'xfdf' }
                : args.fdfPath !== undefined
                  ? { bytes: filesHandler.read(args.fdfPath), format: 'fdf' }
                  : { bytes: _fieldsToJsonBytes(args.fields ?? {}), format: 'json' };

        const inputBytes = filesHandler.read(args.inputPath);
        const filledBytes = await platformHandler.fillForms(
          inputBytes,
          dataFile.bytes,
          dataFile.format,
          params,
        );

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

  server.registerTool(
    'create_fillable_forms',
    {
      description:
        'Use this tool to generate a new PDF containing the provided form fields as real, ' +
        'fillable AcroForm fields. The fields are typically the `formFields` returned by the ' +
        'smart_detect_form_fields tool.',
      inputSchema: {
        ...singleFileInputSchema.shape,
        formFields: _formFieldsSchema.shape.formFields,
      },
      annotations: NON_DESTRUCTIVE('Create Fillable Forms'),
    },
    async (args) => {
      try {
        const filesHandler = getDep(context, 'filesHandler');
        const platformHandler = getDep(context, 'platformHandler');

        const fields: FormFields = { formFields: args.formFields };
        const inputBytes = filesHandler.read(args.inputPath);
        const fillableBytes = await platformHandler.createFillableForms(inputBytes, fields);

        const outputPath = filesHandler.write(args.inputPath, fillableBytes, {
          stemSuffix: 'fillable',
          ext: 'pdf',
        });

        return _successResult(path.basename(outputPath));
      } catch (err) {
        return handleToolError('create_fillable_forms', err);
      }
    },
  );
}
