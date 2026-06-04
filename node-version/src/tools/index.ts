import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../context.js';
import { register as registerConversions } from './conversions.js';
import { register as registerExtractions } from './extractions.js';
import { register as registerFileManagement } from './fileManagement.js';
import { register as registerGenerations } from './generations.js';
import { register as registerPii } from './pii.js';
import { register as registerTransformations } from './transformations.js';

export function registerAll(server: McpServer, context: AppContext): void {
  registerFileManagement(server, context);
  registerConversions(server, context);
  registerExtractions(server, context);
  registerGenerations(server, context);
  registerPii(server, context);
  registerTransformations(server, context);
}
