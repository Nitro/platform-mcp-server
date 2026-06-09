import { z } from 'zod';

export const singleFileInputSchema = z.object({
  inputPath: z
    .string()
    .describe(
      "Full path to the source file (e.g., '~/Downloads/file.pdf' or '/home/user/Documents/file.pdf'). Must include the directory — bare filenames are not accepted.",
    ),
});

export const singleFileOutputSchema = z.object({
  outputFilename: z
    .string()
    .describe('Filename of the output file (written to the same directory as the input)'),
});

export const outputTargetSchema = z
  .enum(['inline', 'file', 'both'])
  .default('inline')
  .describe(
    "Where to send the extracted output (JSON or text). 'inline' (default) returns the " +
      'data directly in the tool result so you can use it immediately or feed it into a ' +
      "follow-up step. 'file' writes the data to a file on disk and returns only the " +
      "filename (use when the user wants to keep the data). 'both' does both. " +
      "Prefer 'inline' for chained or transient work; choose 'file'/'both' only when " +
      'the user explicitly wants the result saved.',
  );

export type OutputTarget = z.infer<typeof outputTargetSchema>;

export type SingleFileInput = z.infer<typeof singleFileInputSchema>;
export type SingleFileOutput = z.infer<typeof singleFileOutputSchema>;
