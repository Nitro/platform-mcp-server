import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export const READ_ONLY = (title: string, opts?: { idempotent?: boolean }): ToolAnnotations => ({
  title,
  readOnlyHint: true,
  openWorldHint: true,
  ...(opts?.idempotent ? { idempotentHint: true } : {}),
});
export const NON_DESTRUCTIVE = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
});
export const DESTRUCTIVE = (title: string): ToolAnnotations => ({
  title,
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
});
