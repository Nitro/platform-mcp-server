import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createClient } from './helpers/client.js';
import { createAppContext } from './helpers/fixtures.js';

// The `tools` array in manifest.json is maintained by hand: `mcpb pack` copies the manifest
// through as-is rather than populating it from the server. Anything that reads the manifest
// instead of calling tools/list therefore sees the committed array, so a tool added without
// updating it is advertised inconsistently.
//
// These tests fail when the committed array drifts from what the server registers -- a missing
// tool, an extra one, or a description edited in only one of the two places. On failure, copy
// the array printed by the last test into manifest.json.

interface _ManifestTool {
  name: string;
  description: string;
}

const _MANIFEST_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'manifest.json',
);

function _manifestTools(): _ManifestTool[] {
  const parsed: unknown = JSON.parse(readFileSync(_MANIFEST_PATH, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('manifest.json did not parse to an object');
  }
  const tools = (parsed as Record<string, unknown>).tools;
  if (!Array.isArray(tools)) {
    throw new Error('manifest.json has no tools array');
  }
  return tools as _ManifestTool[];
}

describe('manifest tool list parity', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ client, cleanup } = await createClient(createAppContext()));
  });

  afterEach(async () => {
    await cleanup();
  });

  it('advertises every registered tool, in registration order', async () => {
    const { tools } = await client.listTools();
    expect(_manifestTools().map((t) => t.name)).toEqual(tools.map((t) => t.name));
  });

  it('has no tools that the server does not register', async () => {
    const { tools } = await client.listTools();
    const registered = new Set(tools.map((t) => t.name));
    expect(_manifestTools().filter((t) => !registered.has(t.name))).toEqual([]);
  });

  it('describes each tool the same way the server does', async () => {
    const { tools } = await client.listTools();
    const manifest = new Map(_manifestTools().map((t) => [t.name, t.description]));
    const mismatched = tools
      .filter((t) => manifest.has(t.name) && manifest.get(t.name) !== t.description)
      .map((t) => t.name);
    expect(mismatched).toEqual([]);
  });

  it('matches the server tool list exactly', async () => {
    const { tools } = await client.listTools();
    const expected = tools.map((t) => ({ name: t.name, description: t.description }));
    // Printed so a failing run gives the exact array to paste into manifest.json.
    const hint = `expected manifest.tools:\n${JSON.stringify(expected, null, 2)}`;
    expect(_manifestTools(), hint).toEqual(expected);
  });
});
