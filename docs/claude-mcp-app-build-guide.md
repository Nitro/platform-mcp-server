# Building for Claude's Inline MCP-App Sandbox

A guide for frontend developers integrating a viewer/editor component into Claude Desktop via the MCP-App extension API.

---

## What is the MCP-App Sandbox?

Claude Desktop supports a feature called **MCP Apps** (`@modelcontextprotocol/ext-apps`). An MCP tool can register a UI resource (`text/html;profile=mcp-app`) and Claude will render it inline in the conversation — no browser popup, no second login.

The renderer is a sandboxed iframe. The sandbox has one hard constraint:

> **All outbound network is blocked by CSP.** No CDN fetches, no API calls, no localhost, no external fonts or stylesheets.

Everything the viewer needs must be **self-contained inside the HTML string** that the MCP server returns.

---

## The Single-File Requirement

The MCP resource API returns a single string of HTML. There is no concept of sibling files — you cannot reference `main.js`, `styles.css`, or a `.wasm` file sitting next to the HTML. If your build output is a folder of files, none of those files are reachable from the iframe.

**This means:**
- All JavaScript must be inlined into `<script>` tags
- All CSS must be inlined into `<style>` tags
- All fonts must be base64 data URIs
- Any WASM must be inlined or loaded via the MCP bridge (see below)
- No CDN links of any kind

---

## How We Build for It

We use **`vite-plugin-singlefile`** — a Vite plugin that inlines all JS, CSS, and assets into a single HTML file at build time.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    rollupOptions: { input: 'index.html' },
  },
});
```

The output is one `index.html` — typically 3–10 MB — with everything inlined. The browser caches it after the first load.

**For Angular:** the same principle applies. The Kendo CSS and Google Fonts currently loaded at runtime in `app.component.ts` need to be imported statically so the bundler can inline them. A thin Vite wrapper project imports the Angular Elements bundle and applies `vite-plugin-singlefile` on top.

---

## How PDF Bytes Reach the Viewer

Since the sandbox blocks all network, the viewer cannot fetch the PDF from disk or from an API. Instead, bytes flow through the **MCP bridge** — a secure channel between the iframe and the MCP server.

The viewer calls back to the server using `app.callServerTool()` from `@modelcontextprotocol/ext-apps`:

```js
import { App } from '@modelcontextprotocol/ext-apps';

const app = new App();
const result = await app.callServerTool('get_pdf_for_viewer', { filePath });
const { pdfBytes } = JSON.parse(result.content[0].text); // base64
const buffer = Uint8Array.from(atob(pdfBytes), c => c.charCodeAt(0)).buffer;

// Feed to your component:
document.querySelector('nitro-pdf-reader').file = buffer;
```

On the MCP server side, `get_pdf_for_viewer` reads the file and returns the bytes:

```ts
server.registerTool('get_pdf_for_viewer', { inputSchema: { filePath: z.string() } }, ({ filePath }) => {
  const bytes = filesHandler.read(filePath);
  return { content: [{ type: 'text', text: JSON.stringify({ pdfBytes: bytes.toString('base64') }) }] };
});
```

This is the only way to get data into the viewer. The MCP bridge is not blocked by the sandbox CSP.

---

## What Already Works (Our PoC)

We have a working proof-of-concept in this repo (`src/tools/inlinePdfPoc.ts`):

- `view_pdf_inline` — MCP-App tool that mounts the viewer and passes `{ filePath, filename }` to it
- `get_pdf_for_viewer` — byte bridge tool the viewer calls on load
- `save_pdf_edits` — stub for persisting edits back to disk
- `src/assets/mcp-app.html` — 3.8 MB single-file bundle (pdf.js inlined), confirmed rendering on our enterprise account

The component API contract we're targeting:

| Direction | Mechanism |
|---|---|
| File → viewer | `app.callServerTool('get_pdf_for_viewer')` → `ArrayBuffer` → `viewer.file = buffer` |
| Edits → disk | viewer fires event with modified bytes → `app.callServerTool('save_pdf_edits')` |

---

## What Needs to Change in `nitro-pdf-reader`

| Issue | Fix |
|---|---|
| Kendo CSS fetched from `static.gonitro.com` at runtime | Import statically so bundler inlines it |
| Google Fonts fetched from `fonts.googleapis.com` at runtime | Self-host the font files or import locally |
| Multi-file Angular build output | Wrap in a Vite project with `vite-plugin-singlefile` |
| WASM loaded via URL | Either inline as base64 or serve via a new `get_viewer_resource` MCP bridge tool |

The component itself (`<nitro-pdf-reader>`) does not need to change — only the build pipeline around it.

---

## References

- [`@modelcontextprotocol/ext-apps`](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps) — MCP-App SDK
- [`vite-plugin-singlefile`](https://github.com/richardtallent/vite-plugin-singlefile) — single-file bundler
- [PDF-Tools open source MCP](https://github.com/Open-Document-Alliance/PDF-Tools) — reference implementation using the same pattern
