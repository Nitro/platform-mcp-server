import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerAll } from '../../src/tools/index.js';
import type { AppContext } from '../../src/context.js';

/**
 * Connects an in-memory client to a server with all tools registered, so tests can
 * inspect the tool list exactly as a real client would see it. No network or auth.
 */
export async function createClient(context: AppContext): Promise<{
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
