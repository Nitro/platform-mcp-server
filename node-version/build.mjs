import { build } from 'esbuild';
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { version } = require('./manifest.json');

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/bundle.cjs',
  define: {
    // Replace import.meta.url (ESM-only) with a CJS equivalent so that
    // fileURLToPath(import.meta.url) resolves correctly in the bundle.
    // __filename is injected by esbuild for CJS output.
    'import.meta.url': '__importMetaUrl',
    'process.env.MCP_SERVER_VERSION': JSON.stringify(version),
  },
  banner: {
    js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;",
  },
});

// Copy legacy viewer-app/ into dist/viewer-app/ (used by the Express server fallback).
const srcDir = path.resolve('viewer-app');
const destDir = path.resolve('dist', 'viewer-app');
fs.mkdirSync(destDir, { recursive: true });
for (const file of fs.readdirSync(srcDir)) {
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}
console.log(`Copied viewer-app/ → dist/viewer-app/`);

// Copy the built MCP App HTML (React inline viewer) into dist/mcp-viewer-app/
// so the ui:// resource handler can read it from a stable path in the bundle.
const mcpAppSrc = path.resolve('mcp-viewer-app', 'dist', 'mcp-app.html');
const mcpAppDestDir = path.resolve('dist', 'mcp-viewer-app');
fs.mkdirSync(mcpAppDestDir, { recursive: true });
if (fs.existsSync(mcpAppSrc)) {
  fs.copyFileSync(mcpAppSrc, path.join(mcpAppDestDir, 'mcp-app.html'));
  console.log(`Copied mcp-viewer-app/dist/mcp-app.html → dist/mcp-viewer-app/`);
} else {
  console.warn(`⚠ mcp-viewer-app not built — run: cd mcp-viewer-app && npm run build`);
}
