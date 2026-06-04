import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../context.js';
import { register as registerConversions } from './conversions.js';
import { register as registerExtractions } from './extractions.js';
import { register as registerFileManagement } from './fileManagement.js';
import { register as registerPii } from './pii.js';
import { register as registerTransformations } from './transformations.js';
import { register as registerViewer } from './viewer.js';
import { register as registerInlineApp } from './inlineApp.js';

export function registerAll(server: McpServer, context: AppContext): void {
  registerFileManagement(server, context);
  registerConversions(server, context);
  registerExtractions(server, context);
  registerPii(server, context);
  registerTransformations(server, context);
  registerViewer(server, context);
  registerInlineApp(server, context);
}
