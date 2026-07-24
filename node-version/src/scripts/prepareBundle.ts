import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AppContext } from '../context.js';
import { registerAll } from '../tools/index.js';
import { logger } from '../logger.js';

interface _ManifestTool {
  readonly name: string;
  readonly description: string;
}

const _nodeVersionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const _mcpRootDir = path.resolve(_nodeVersionDir, '..');
const _stageDir = path.join(_nodeVersionDir, '../build/stage');

async function _discoverTools(): Promise<_ManifestTool[]> {
  const server = new McpServer({ name: 'nitro-mcp', version: '0.0.0' });
  registerAll(server, {} as AppContext);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'manifest-tool-generator', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const { tools } = await client.listTools();

  await client.close();
  await server.close();

  return tools.map((tool) => ({ name: tool.name, description: tool.description ?? '' }));
}

function _copyInto(sourcePath: string, destName: string): void {
  fs.cpSync(sourcePath, path.join(_stageDir, destName), { recursive: true });
}

async function main(): Promise<void> {
  fs.rmSync(_stageDir, { recursive: true, force: true });
  fs.mkdirSync(_stageDir, { recursive: true });

  _copyInto(path.join(_nodeVersionDir, 'dist'), 'dist');
  _copyInto(path.join(_nodeVersionDir, 'package.json'), 'package.json');
  _copyInto(path.join(_nodeVersionDir, 'icon.png'), 'icon.png');
  _copyInto(path.join(_mcpRootDir, 'LICENSE'), 'LICENSE');

  const manifestPath = path.join(_nodeVersionDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  const tools = await _discoverTools();
  manifest.tools = tools;

  fs.writeFileSync(path.join(_stageDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  logger.info(`Staged bundle at ${_stageDir} (${String(tools.length)} tools).`);
}

await main();
