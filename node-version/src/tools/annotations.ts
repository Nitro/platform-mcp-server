import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export const READ_ONLY = (title: string): ToolAnnotations => ({ title, readOnlyHint: true });
export const NON_DESTRUCTIVE = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint: false,
});
export const DESTRUCTIVE = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint: true,
});
