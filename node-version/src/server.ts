import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PkceManager } from './auth/pkceManager.js';
import { settings } from './config.js';
import type { AppContext } from './context.js';
import { FilesHandler } from './handlers/filesHandler.js';
import { PlatformHandler } from './handlers/platformHandler.js';
import { registerAll } from './tools/index.js';

async function _buildContext(): Promise<AppContext> {
  let platformHandler: PlatformHandler;
  if (settings.authMode === 'token-auth') {
    platformHandler = PlatformHandler.fromAuthToken(settings.apiUrl, settings.authToken);
  } else if (settings.authMode === 'pkce') {
    const pkceManager = new PkceManager(settings.pkceConfig);
    await pkceManager.initialize();
    platformHandler = PlatformHandler.fromPkce(settings.apiUrl, pkceManager);
  } else {
    const { clientId, clientSecret } = settings.clientCredentials;
    platformHandler = await PlatformHandler.fromClientCredentials(
      settings.apiUrl,
      clientId,
      clientSecret,
    );
  }
  return { platformHandler, filesHandler: new FilesHandler(settings.baseDir) };
}

export async function main(): Promise<void> {
  const context = await _buildContext();

  const server = new McpServer(
    { name: settings.name, version: settings.version },
    {
      instructions:
        "PDF processing tools backed by Nitro's Document Intelligence Platform." +
        ' Capabilities: discover local files (list_files); convert between PDF and' +
        ' Office or image formats (convert_file); merge, split, rotate,' +
        ' protect, unprotect, flatten, and redact PDFs; delete pages; get and set PDF' +
        ' metadata; and extract text, tables, form fields, or PII (with bounding boxes' +
        ' and confidence scores) from PDFs. Each tool operates on a local file path —' +
        ' when the user references a filename or folder without a full path, use' +
        ' list_files to resolve it before calling other tools. Files are uploaded to' +
        " Nitro's hosted API at api.gonitro.com for processing; results are written to" +
        ' disk next to the input. Data handling: https://www.gonitro.com/legal/privacy-policy',
    },
  );

  registerAll(server, context);

  server.registerResource(settings.name, 'nitro://welcome', { mimeType: 'text/markdown' }, () => ({
    contents: [
      {
        uri: 'nitro://welcome',
        mimeType: 'text/markdown',
        text:
          `# Nitro MCP\n\n` +
          `Version: ${settings.version}\n\n` +
          "PDF processing tools powered by Nitro's Document Intelligence Platform.\n\n" +
          "Specify folders naturally (e.g., 'list files from Downloads') or use full paths.\n" +
          'Common folders: Downloads, Documents, Desktop, Pictures\n',
      },
    ],
  }));

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
