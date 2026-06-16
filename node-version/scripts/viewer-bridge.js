/*
  viewer-bridge.js — MCP-App glue for the inlined nitro-pdf-reader.

  Conor's <nitro-pdf-reader> knows nothing about MCP. This bridge:
    1. Instantiates the ext-apps App and connects → the handshake + autoResize
       make the iframe report its height (without this the host renders it at
       zero height — i.e. blank).
    2. On the launching tool result (view_pdf_inline → { filePath, filename }),
       calls get_pdf_for_viewer over the MCP bridge, decodes the base64 PDF, and
       assigns it to the reader's `file` property (ArrayBuffer input).

  Bundled (with @modelcontextprotocol/ext-apps) by inline-viewer.mjs and injected
  as a module <script> after the app bundle. Save-back wiring is a follow-up.
*/

import { App } from '@modelcontextprotocol/ext-apps';

const TAG = 'nitro-pdf-reader';

// Progress goes to the console; only errors surface a visible strip (so a
// failure is diagnosable without devtools, but success leaves the UI clean).
function _status(msg, isError) {
  if (!isError) {
    console.log(`[nitro-bridge] ${msg}`);
    return;
  }
  let el = document.getElementById('__nitro_status');
  if (!el) {
    el = document.createElement('div');
    el.id = '__nitro_status';
    el.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;font:12px monospace;' +
      'padding:4px 8px;white-space:pre-wrap;background:#111;color:#f66;opacity:.95';
    document.body.appendChild(el);
  }
  el.textContent = `[nitro-bridge] ${msg}`;
}

function _decodeBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// The bridge sets reader.file from outside Angular's zone, so no change-detection
// tick runs and the reader doesn't render until a user interaction. Dispatching
// zone-patched events (resize/visibilitychange) forces CD + a size re-measure.
// Pulse a few times because the PDF pages render asynchronously.
function _nudgeRender() {
  const fire = () => {
    try {
      window.dispatchEvent(new Event('resize'));
      document.dispatchEvent(new Event('visibilitychange'));
    } catch {
      /* ignore */
    }
  };
  fire();
  for (const t of [50, 150, 350, 700, 1200, 2500]) setTimeout(fire, t);
}

function _readPayload(result) {
  const textPart = result?.content?.find?.((c) => c.type === 'text')?.text;
  if (textPart) return JSON.parse(textPart);
  if (result?.structuredContent) return result.structuredContent;
  return null;
}

async function _loadFile(app, filePath, filename) {
  _status(`calling get_pdf_for_viewer(${filePath})…`);
  const res = await app.callServerTool({
    name: 'get_pdf_for_viewer',
    arguments: { filePath },
  });
  const payload = _readPayload(res);
  if (!payload?.pdfBytes) {
    throw new Error(`no pdfBytes (isError=${res?.isError}; got: ${JSON.stringify(payload)?.slice(0, 120)})`);
  }
  const buf = _decodeBase64(payload.pdfBytes);
  _status(`got ${buf.byteLength} bytes; waiting for <${TAG}>…`);

  await customElements.whenDefined(TAG);
  const reader = document.querySelector(TAG);
  if (!reader) throw new Error(`<${TAG}> not found in DOM`);
  // fileName MUST be set before file: the component dispatches its load event
  // when `file` changes and reads the name at that instant — name-after-file
  // shows the "document.pdf" fallback in the header.
  reader.fileName = filename ?? payload.filename ?? 'document.pdf';
  reader.file = buf;
  globalThis.__nitroFilePath = filePath;
  _status(`set reader.file (${buf.byteLength} bytes) ✓`);
  // Force render now instead of waiting for the user's first click.
  _nudgeRender();
}

// Surface errors the reader/worker raise (pdfium open failures, wasm init, etc.)
// into the visible strip so we can diagnose without devtools.
const _origError = console.error.bind(console);
console.error = (...args) => {
  try {
    _status(`console.error: ${args.map((a) => (a?.message ?? String(a))).join(' ')}`.slice(0, 300), true);
  } catch {
    /* ignore */
  }
  _origError(...args);
};
window.addEventListener('error', (e) => _status(`window error: ${e.message}`, true));
window.addEventListener('unhandledrejection', (e) =>
  _status(`unhandledrejection: ${e.reason?.message ?? String(e.reason)}`.slice(0, 300), true),
);

const app = new App({ name: 'nitro-pdf-reader-viewer', version: '1.0.0' }, {});

// ── Download interception ───────────────────────────────────────────────────
// The reader downloads via createObjectURL + <a download>.click()
// (initiateBrowserDownload in @gonitro/shared-utils), but the sandboxed iframe
// has no allow-downloads permission, so the click silently does nothing.
// Track blob URLs and reroute anchor-download clicks through the host's
// ui/download-file request — Claude then saves the file natively (user picks
// the location via the usual download flow).
const _blobsByUrl = new Map();
const _origCreateObjectURL = URL.createObjectURL.bind(URL);
URL.createObjectURL = (obj) => {
  const url = _origCreateObjectURL(obj);
  if (obj instanceof Blob) _blobsByUrl.set(url, obj);
  return url;
};
const _origRevokeObjectURL = URL.revokeObjectURL.bind(URL);
URL.revokeObjectURL = (url) => {
  // The reader revokes immediately after click; the Blob object stays valid —
  // only drop our reference after a grace period so the async reroute can run.
  setTimeout(() => _blobsByUrl.delete(url), 60_000);
  _origRevokeObjectURL(url);
};

async function _blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function _hostDownload(blob, filename) {
  _status(`sending ${filename} (${blob.size} bytes) to host for download…`);
  await app.downloadFile({
    contents: [
      {
        type: 'resource',
        resource: {
          uri: `file:///${encodeURIComponent(filename)}`,
          mimeType: blob.type || 'application/pdf',
          blob: await _blobToBase64(blob),
        },
      },
    ],
  });
  _status(`download handed to host ✓`);
}

const _origAnchorClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function () {
  const blob = this.download ? _blobsByUrl.get(this.href) : undefined;
  if (!blob) {
    _origAnchorClick.call(this);
    return;
  }
  const filename = this.download || 'document.pdf';
  _hostDownload(blob, filename).catch((err) => _status(`download failed: ${String(err)}`, true));
};

// ── Widescreen toggle ───────────────────────────────────────────────────────
// Floating button asking the host to switch the widget between inline and
// fullscreen display modes (ui/request-display-mode). The host may refuse or
// downgrade — the actually-applied mode comes back in the result and drives
// the button state. Placed bottom-right above the reader footer, clear of the
// zoom controls.
let _displayMode = 'inline';

function _setWidescreenIcon(btn) {
  btn.textContent = _displayMode === 'fullscreen' ? '🗗' : '⛶';
  btn.title = _displayMode === 'fullscreen' ? 'Exit widescreen' : 'Widescreen';
}

async function _toggleWidescreen(btn) {
  const want = _displayMode === 'fullscreen' ? 'inline' : 'fullscreen';
  try {
    const res = await app.requestDisplayMode({ mode: want });
    _displayMode = res?.mode ?? _displayMode;
    _setWidescreenIcon(btn);
    if (_displayMode !== want) _status(`host kept display mode "${_displayMode}"`);
  } catch (err) {
    _status(`widescreen toggle failed: ${String(err)}`, true);
  }
}

function _addWidescreenButton() {
  _displayMode = app.getHostContext()?.displayMode ?? _displayMode;
  const btn = document.createElement('button');
  btn.id = '__nitro_widescreen';
  btn.type = 'button';
  btn.style.cssText =
    'position:fixed;right:16px;bottom:72px;z-index:2147483646;width:40px;height:40px;' +
    'border-radius:50%;border:none;cursor:pointer;background:#090b21;color:#fff;' +
    'font-size:18px;line-height:40px;text-align:center;opacity:.85;' +
    'box-shadow:0 2px 8px rgba(0,0,0,.35)';
  _setWidescreenIcon(btn);
  btn.addEventListener('mouseenter', () => (btn.style.opacity = '1'));
  btn.addEventListener('mouseleave', () => (btn.style.opacity = '.85'));
  btn.addEventListener('click', () => void _toggleWidescreen(btn));
  document.body.appendChild(btn);
}

// Must be registered before connect() — the launching tool result arrives as a
// notification right after the initialize handshake.
app.ontoolresult = async (result) => {
  try {
    const data = _readPayload(result);
    if (!data?.filePath) {
      _status(`tool result had no filePath: ${JSON.stringify(data)?.slice(0, 120)}`, true);
      return;
    }
    await _loadFile(app, data.filePath, data.filename);
  } catch (err) {
    _status(`load failed: ${String(err)}`, true);
    console.error('[nitro-bridge] load failed', err);
  }
};

_status('connecting to host…');
app
  .connect()
  .then(() => {
    _status('connected; awaiting tool result…');
    _addWidescreenButton();
  })
  .catch((err) => _status(`connect failed: ${String(err)}`, true));
