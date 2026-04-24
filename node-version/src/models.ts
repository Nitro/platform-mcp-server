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

export type SingleFileInput = z.infer<typeof singleFileInputSchema>;
export type SingleFileOutput = z.infer<typeof singleFileOutputSchema>;
