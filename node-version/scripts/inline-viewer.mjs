/*
  inline-viewer.mjs — Folds the multi-file `nitro-pdf-reader` build (Conor's
  WAR-578-public-reader branch, `nx build public-reader`) into ONE self-contained
  HTML so it can be served as an MCP-App resource (the sandbox has no origin and
  cannot fetch sibling files).

  Three nested inlining problems, solved bottom-up:
    1. WASM  → worker: the 12 MB core_sdk_wasm.wasm is base64'd into a data: URL
       and the worker's `new URL("core_sdk_wasm.wasm", import.meta.url)` /
       emscripten locateFile defaults are rewritten to point at it.
    2. worker → app: the worker (now wasm-inlined) is embedded as a Blob URL; the
       app's `new Worker(new URL("worker-LW7D52JS.js", import.meta.url), …)` is
       rewritten to use it. The app's 15 code-split chunks + 5 dynamic imports are
       collapsed into one ESM file by esbuild (splitting off, format esm so
       import.meta still works).
    3. app → html: app + polyfills inlined as <script type="module">; the Kendo
       theme CSS is fetched and inlined. (Google Fonts left as-is for now — see
       FONTS note; they degrade gracefully to system fonts in the sandbox.)

  Usage:
    node scripts/inline-viewer.mjs <path-to-dist/en> [outFile]
  Default outFile: src/assets/mcp-app.html
*/

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EN = process.argv[2];
const OUT = process.argv[3] ?? path.resolve(__dirname, '..', 'src', 'assets', 'mcp-app.html');
const KENDO_CSS_URL = 'https://static.gonitro.com/kendo/3.x/latest/nitro-kendo-theme.min.css';

if (!EN || !fs.existsSync(path.join(EN, 'index.html'))) {
  console.error(`Pass the build output dir (the folder containing index.html). Got: ${EN}`);
  process.exit(1);
}

const WORKER_FILE = fs.readdirSync(EN).find((f) => /^worker-.*\.js$/.test(f));
const WASM_FILE = fs.readdirSync(EN).find((f) => f.endsWith('.wasm'));
if (!WORKER_FILE || !WASM_FILE) {
  console.error(`Could not find worker/wasm in ${EN} (worker=${WORKER_FILE}, wasm=${WASM_FILE})`);
  process.exit(1);
}

function _mb(n) {
  return (n / 1e6).toFixed(2) + ' MB';
}

// ── 1. WASM → data URL, inlined into the worker source ──────────────────────
function _buildWorkerSource() {
  const wasmB64 = fs.readFileSync(path.join(EN, WASM_FILE)).toString('base64');
  let src = fs.readFileSync(path.join(EN, WORKER_FILE), 'utf-8');
  // Point the URL refs at a data: URL (used only by locateFile fallbacks).
  src = src.replaceAll('new URL("core_sdk_wasm.wasm",import.meta.url).href', '__NITRO_WASM_URL__');
  src = src.replaceAll('"/core_sdk_wasm.wasm"', '__NITRO_WASM_URL__');
  src = src.replaceAll('"core_sdk_wasm.wasm"', '__NITRO_WASM_URL__');
  // CRITICAL: the sandbox CSP (connect-src) blocks fetch() of data:/blob: URLs, so
  // emscripten can't fetch the wasm. Feed the bytes straight in via Module.wasmBinary
  // (emscripten reads `c.wasmBinary` and skips fetch/instantiateStreaming entirely).
  const injected = src.replaceAll('{locateFile:', '{wasmBinary:__NITRO_WASM_BYTES__,locateFile:');
  if (injected === src) {
    throw new Error('Could not find emscripten `{locateFile:` config to inject wasmBinary');
  }
  src = injected;
  // Embed the base64 ONCE; derive both the bytes (real load path) and the data URL.
  const prelude =
    `var __NITRO_WASM_B64__=${JSON.stringify(wasmB64)};` +
    `var __NITRO_WASM_BYTES__=Uint8Array.from(atob(__NITRO_WASM_B64__),(c)=>c.charCodeAt(0));` +
    `var __NITRO_WASM_URL__="data:application/wasm;base64,"+__NITRO_WASM_B64__;\n`;
  return prelude + src;
}

// ── 2. App → single ESM bundle, worker embedded as a Blob URL ───────────────
async function _buildAppSource(workerSource) {
  const result = await build({
    entryPoints: [path.join(EN, 'main.js')],
    bundle: true,
    format: 'esm',
    splitting: false,
    write: false,
    logLevel: 'error',
    legalComments: 'none',
  });
  let app = result.outputFiles[0].text;
  const before = app.length;
  // Embed the (wasm-inlined) worker as a Blob URL the app spawns from.
  const prelude =
    `const __VIEWER_WORKER_URL__=URL.createObjectURL(` +
    `new Blob([${JSON.stringify(workerSource)}],{type:"text/javascript"}));\n`;
  app =
    prelude +
    app.replace(
      'new URL("worker-LW7D52JS.js", import.meta.url)'.replace('LW7D52JS', WORKER_FILE.match(/worker-(.*)\.js/)[1]),
      '__VIEWER_WORKER_URL__',
    );
  const replaced = app.includes('__VIEWER_WORKER_URL__') && app.length > before;
  return { app, replaced };
}

// Bundle the MCP-App bridge (with @modelcontextprotocol/ext-apps) into one IIFE.
async function _buildBridgeSource() {
  const result = await build({
    entryPoints: [path.resolve(__dirname, 'viewer-bridge.js')],
    bundle: true,
    format: 'iife',
    write: false,
    logLevel: 'error',
    legalComments: 'none',
    absWorkingDir: path.resolve(__dirname, '..'),
  });
  return result.outputFiles[0].text;
}

async function _fetchKendoCss() {
  try {
    const res = await fetch(KENDO_CSS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    console.warn(`⚠️  Could not fetch Kendo CSS (${String(err)}). Leaving CDN link in place.`);
    return null;
  }
}

// ── FONTS → data: URLs ──────────────────────────────────────────────────────
// The IBM Plex @font-face rules (inlined in index.html) point at woff2 files on
// fonts.gstatic.com. The sandbox CSP blocks loading them, so the reader falls back
// to system fonts and looks off. Fetch each woff2 at build time and rewrite the
// `url(...)` to a data: URL FIRST, keeping the gstatic URL as a second src so it
// can still load as a CSP-allowlisted fallback if the host blocks data: fonts.
async function _inlineFonts(html) {
  const urls = [...new Set(html.match(/https:\/\/fonts\.gstatic\.com\/[^)'"]+\.woff2/g) ?? [])];
  if (!urls.length) return { html, count: 0, total: 0 };
  const entries = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        return [url, `data:font/woff2;base64,${buf.toString('base64')}`];
      } catch (err) {
        console.warn(`⚠️  font fetch failed (${url}): ${String(err)}`);
        return [url, null];
      }
    }),
  );
  let out = html;
  let count = 0;
  for (const [url, dataUrl] of entries) {
    if (!dataUrl) continue;
    // Replacement FUNCTION so the base64 isn't interpreted as a `$` pattern.
    out = out.replaceAll(`url(${url})`, () => `url(${dataUrl}) format('woff2'),url(${url})`);
    count++;
  }
  return { html: out, count, total: urls.length };
}

async function main() {
  console.log(`worker: ${WORKER_FILE}  wasm: ${WASM_FILE} (${_mb(fs.statSync(path.join(EN, WASM_FILE)).size)})`);

  const workerSource = _buildWorkerSource();
  console.log(`worker (wasm-inlined): ${_mb(workerSource.length)}`);

  const { app, replaced } = await _buildAppSource(workerSource);
  if (!replaced) {
    console.error('❌ Worker spawn token not found/replaced in app bundle — aborting.');
    process.exit(1);
  }
  console.log(`app (worker+wasm inlined): ${_mb(app.length)}`);

  // Default the reader to fit-to-width instead of fit-to-page. The zoom store's
  // initialState is `{zoomMode:"fit-to-page",zoomAnimationDuration:…}`; that exact
  // anchor is unique in the bundle (the other "fit-to-page" hits are dropdown
  // labels and reducer branches we must NOT touch).
  let appSrc = app;
  // Whitespace-tolerant: esbuild pretty-prints as `zoomMode: "fit-to-page",
  // zoomAnimationDuration: …`. The zoomAnimationDuration neighbour makes this the
  // initialState, not a dropdown label or reducer branch. Preserve spacing.
  const ZOOM_RE = /(zoomMode:\s*")fit-to-page(",\s*zoomAnimationDuration)/;
  if (ZOOM_RE.test(appSrc)) {
    appSrc = appSrc.replace(ZOOM_RE, (_m, pre, post) => `${pre}fit-to-width${post}`);
    console.log('✓ default zoom → fit-to-width');
  } else {
    console.warn('⚠️  zoom initialState anchor not found — default zoom left at fit-to-page');
  }

  const polyfills = fs.existsSync(path.join(EN, 'polyfills.js'))
    ? fs.readFileSync(path.join(EN, 'polyfills.js'), 'utf-8')
    : '';

  const bridge = await _buildBridgeSource();
  console.log(`bridge (ext-apps): ${_mb(bridge.length)}`);

  const kendoCss = await _fetchKendoCss();

  let html = fs.readFileSync(path.join(EN, 'index.html'), 'utf-8');
  // Drop modulepreload hints and the external script tags (we inline instead).
  html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
  html = html.replace(/<script src="polyfills\.js"[^>]*><\/script>/g, '');
  html = html.replace(/<script src="main\.js"[^>]*><\/script>/g, '');
  // Inline Kendo theme (replace the CDN <link>). Use a replacement FUNCTION so
  // `$` sequences in the CSS aren't interpreted as String.replace patterns.
  if (kendoCss) {
    html = html.replace(
      /<link rel="stylesheet" href="https:\/\/static\.gonitro\.com[^"]*">/,
      () => `<style>${kendoCss}</style>`,
    );
  }
  // ResponsiveService (in @gonitro/shared-ui-responsive) reads window.innerWidth
  // to classify the viewport into ranges: d (≥1440), tl (1024–1439), tp (768–1023),
  // m (≤767). The iframe is typically narrower than 768px in Claude Desktop, which
  // puts it in range 'm' and hides the top toolbar, Pages sidebar and right pane via
  // responsiveHide="m" directives.
  //
  // Fix: inject a script that overrides window.innerWidth *before* Angular
  // bootstraps so ResponsiveService.setCurrentRange() always sees 1440 (range 'd').
  // No zoom/scale — the component lays out at its natural element width;
  // innerWidth is only used for the responsive breakpoint classification.
  html = html.replace(
    '<head>',
    () =>
      '<head><script>Object.defineProperty(window,"innerWidth",{get:()=>1440,configurable:true});</script>',
  );
  // Drop the dev-harness script (it sets `showOpenButton = true` for local
  // file picking). In Claude the file arrives over MCP — no Open button.
  html = html.replace(/<script type="text\/javascript">[^<]*showOpenButton[^<]*<\/script>/, '');
  // Injected style (no zoom/sizing overrides — natural size + ext-apps autoResize):
  // - hide Print: meaningless inside the Claude widget (no gating input exists
  //   on the component, so hide by test id). Download stays.
  // - hide Kendo toasts (e.g. the file-size tool-limits notification).
  html = html.replace(
    '</head>',
    () =>
      '<style>' +
      '[data-testid="print-button"]{display:none!important;}' +
      '.k-notification-group,.k-notification{display:none!important;}' +
      '</style></head>',
  );
  // Inject inlined scripts before </body>: polyfills → app → bridge.
  // CRITICAL: the bundles contain countless `$` tokens; a replacement *string*
  // would expand `$&`/`` $` ``/`$'` and duplicate huge chunks of the document.
  // A replacement function is taken verbatim.
  const scripts =
    (polyfills ? `<script type="module">${polyfills}</script>` : '') +
    `<script type="module">${appSrc}</script>` +
    `<script type="module">${bridge}</script>`;
  html = html.replace('</body>', () => `${scripts}</body>`);

  // Inline the IBM Plex woff2 fonts as data: URLs (with gstatic fallback) so the
  // reader's typography survives the sandbox CSP instead of degrading to system fonts.
  const fontResult = await _inlineFonts(html);
  html = fontResult.html;
  console.log(`fonts: inlined ${fontResult.count}/${fontResult.total} woff2 as data: URLs`);

  fs.writeFileSync(OUT, html);
  console.log(`\n✅ wrote ${OUT}`);
  console.log(`   final size: ${_mb(html.length)}`);

  // ── Structural validation (no Claude reload needed) ──
  const leftovers = [];
  if (/<script src=/.test(html)) leftovers.push('external <script src>');
  if (/<link rel="stylesheet" href="http/.test(html)) leftovers.push('external stylesheet');
  if (/\bimport\s*\(/.test(app) && !/Promise/.test(app)) leftovers.push('possible unresolved dynamic import');
  if (html.includes(`"${WORKER_FILE}"`)) leftovers.push('residual worker filename ref');
  console.log(
    leftovers.length ? `⚠️  leftover external refs: ${leftovers.join(', ')}` : '✓ no external script/style refs',
  );
  const inlinedFonts = (html.match(/url\(data:font\/woff2/g) ?? []).length;
  console.log(
    inlinedFonts > 0
      ? `✓ ${inlinedFonts} woff2 fonts inlined as data: URLs (gstatic kept as CSP-allowlisted fallback)`
      : '⚠️  no fonts inlined → IBM Plex will fall back to system fonts',
  );
}

await main();
