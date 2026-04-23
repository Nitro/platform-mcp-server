import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../context.js';
import { register as registerConversions } from './conversions.js';
import { register as registerFileManagement } from './fileManagement.js';

export function registerAll(server: McpServer, context: AppContext): void {
  registerFileManagement(server, context);
  registerConversions(server, context);
}
