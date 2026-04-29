import { build } from 'esbuild';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('./manifest.json');

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/bundle.cjs',
  define: {
    'process.env.MCP_SERVER_VERSION': JSON.stringify(version),
  },
});
