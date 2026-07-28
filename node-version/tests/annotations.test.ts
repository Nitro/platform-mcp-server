import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAll } from '../src/tools/index.js';
import { createAppContext } from './helpers/fixtures.js';

async function _createClient(context: ReturnType<typeof createAppContext>): Promise<{
  client: Client;
  cleanup: () => Promise<void>;
}> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerAll(server, context);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, cleanup: async () => client.close() };
}

const _READ_ONLY_TOOLS = [
  { name: 'list_files', title: 'List Files' },
  { name: 'get_pdf_metadata', title: 'Get PDF Metadata' },
  { name: 'extract_pdf_text', title: 'Extract PDF Text' },
  { name: 'extract_pdf_tables', title: 'Extract PDF Tables' },
  { name: 'extract_pdf_forms', title: 'Extract PDF Forms' },
  { name: 'extract_pii', title: 'Extract PII' },
  { name: 'search_text_in_pdf', title: 'Search Text in PDF' },
];

const _IDEMPOTENT_READ_ONLY_TOOLS = [
  'list_files',
  'get_pdf_metadata',
  'extract_pdf_text',
  'extract_pdf_tables',
];

const _NON_DESTRUCTIVE_TOOLS = [
  { name: 'convert_file', title: 'Convert File' },
  { name: 'merge_files', title: 'Merge PDFs' },
  { name: 'split_pdf', title: 'Split PDF' },
  { name: 'rotate_pdf', title: 'Rotate PDF' },
  { name: 'flatten_pdf', title: 'Flatten PDF' },
  { name: 'set_pdf_metadata', title: 'Set PDF Metadata' },
];

const _DESTRUCTIVE_TOOLS = [
  { name: 'protect_pdf', title: 'Password-Protect PDF' },
  { name: 'unprotect_pdf', title: 'Remove PDF Password' },
  { name: 'redact_pdf', title: 'Redact PDF' },
  { name: 'delete_pdf_pages', title: 'Delete PDF Pages' },
];

describe('tool annotations', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ client, cleanup } = await _createClient(createAppContext()));
  });

  afterEach(async () => {
    await cleanup();
  });

  it('read-only tools have readOnlyHint: true, openWorldHint: true, a title, and no destructiveHint', async () => {
    const { tools } = await client.listTools();
    for (const { name, title } of _READ_ONLY_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool?.annotations?.title, name).toBe(title);
      expect(tool?.annotations?.readOnlyHint, name).toBe(true);
      expect(tool?.annotations?.openWorldHint, name).toBe(true);
      expect(tool?.annotations?.destructiveHint, name).toBeUndefined();
    }
  });

  it('non-destructive output tools have readOnlyHint: false, destructiveHint: false, openWorldHint: true, and a title', async () => {
    const { tools } = await client.listTools();
    for (const { name, title } of _NON_DESTRUCTIVE_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool?.annotations?.title, name).toBe(title);
      expect(tool?.annotations?.readOnlyHint, name).toBe(false);
      expect(tool?.annotations?.destructiveHint, name).toBe(false);
      expect(tool?.annotations?.openWorldHint, name).toBe(true);
    }
  });

  it('destructive tools have readOnlyHint: false, destructiveHint: true, openWorldHint: true, and a title', async () => {
    const { tools } = await client.listTools();
    for (const { name, title } of _DESTRUCTIVE_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool?.annotations?.title, name).toBe(title);
      expect(tool?.annotations?.readOnlyHint, name).toBe(false);
      expect(tool?.annotations?.destructiveHint, name).toBe(true);
      expect(tool?.annotations?.openWorldHint, name).toBe(true);
    }
  });

  it('only the read-only extraction tools have idempotentHint: true', async () => {
    const { tools } = await client.listTools();
    for (const { name } of _READ_ONLY_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      const expected = _IDEMPOTENT_READ_ONLY_TOOLS.includes(name) ? true : undefined;
      expect(tool?.annotations?.idempotentHint, name).toBe(expected);
    }
  });
});
