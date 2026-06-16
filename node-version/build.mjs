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
    'import.meta.url': '__importMetaUrl',
    'process.env.MCP_SERVER_VERSION': JSON.stringify(version),
  },
  banner: {
    js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;",
  },
});


// Copy src/assets/ → dist/assets/ so the viewer HTML is available at runtime
const assetsDir = path.resolve('src', 'assets');
const distAssetsDir = path.resolve('dist', 'assets');
if (fs.existsSync(assetsDir)) {
  fs.mkdirSync(distAssetsDir, { recursive: true });
  for (const file of fs.readdirSync(assetsDir)) {
    fs.copyFileSync(path.join(assetsDir, file), path.join(distAssetsDir, file));
  }
  console.log(`Copied src/assets/ → dist/assets/`);
}
