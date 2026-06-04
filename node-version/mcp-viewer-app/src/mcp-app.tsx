import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { PdfViewer } from "./components/PdfViewer";
import "./styles.css";

function NitroPdfViewer() {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [filePath, setFilePath] = useState<string>("");
  const [filename, setFilename] = useState<string>("");
  const [rotations, setRotations] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const { app, error } = useApp({
    appInfo: { name: "Nitro PDF Viewer", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (createdApp) => {
      // Receives the file path from the open_in_viewer tool result
      createdApp.ontoolresult = async (result) => {
        try {
          const firstContent = result.content[0];
          if (firstContent.type !== "text") return;

          const data = JSON.parse(firstContent.text);
          setFilePath(data.filePath);
          setFilename(data.filename);

          await createdApp.sendLog({ level: "info", data: `Loading PDF: ${data.filename}` });

          // Fetch PDF bytes from the server via a helper tool
          const pdfResult = await createdApp.callServerTool({
            name: "get_pdf_for_viewer",
            arguments: { filePath: data.filePath },
          });

          const pdfContent = pdfResult.content[0];
          if (pdfContent.type === "text") {
            const pdfData = JSON.parse(pdfContent.text);
            if (pdfData.pdfBytes) {
              const bytes = Uint8Array.from(atob(pdfData.pdfBytes), (c) => c.charCodeAt(0));
              setPdfBytes(bytes);
              await createdApp.sendLog({
                level: "info",
                data: `PDF loaded (${bytes.length} bytes)`,
              });
            }
          }
        } catch (err) {
          await createdApp.sendLog({ level: "error", data: `Failed to load PDF: ${err}` });
        }
      };
    },
  });

  const handleTotalPages = useCallback((total: number) => {
    setTotalPages(total);
    setRotations(Array(total).fill(0));
  }, []);

  const handleRotate = useCallback(
    (delta: number) => {
      setRotations((prev) => prev.map((r) => (r + delta + 360) % 360));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!app || isSaving) return;
    setIsSaving(true);
    setStatusMsg("Saving…");
    try {
      const result = await app.callServerTool({
        name: "save_pdf_edits",
        arguments: { filePath, rotations },
      });
      const content = result.content[0];
      if (content.type === "text") {
        const data = JSON.parse(content.text);
        setStatusMsg(`Saved → ${data.outputFilename}`);
        setTimeout(() => setStatusMsg(""), 4000);
      }
    } catch (err) {
      setStatusMsg(`Save failed: ${err}`);
    } finally {
      setIsSaving(false);
    }
  }, [app, filePath, rotations, isSaving]);

  if (error) {
    return (
      <div className="state-container">
        <div className="error-icon">⚠</div>
        <p className="state-text">{error.message}</p>
      </div>
    );
  }

  if (!app || !pdfBytes) {
    return (
      <div className="state-container">
        <div className="spinner" />
        <p className="state-text">
          {!app ? "Connecting…" : `Loading ${filename || "PDF"}…`}
        </p>
      </div>
    );
  }

  return (
    <div className="viewer-shell">
      {/* ── Toolbar ── */}
      <div className="toolbar">
        <div className="toolbar-logo">
          <svg width="60" height="23" viewBox="0 0 80 31" fill="none">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M13.4553 20.5908L10.2649 17.7236V17.7241L10.0326 17.4928L10.0454 17.5864L10.0324 17.492L9.94914 16.8897L8.99678 10.0102C9.01094 10.0262 9.02627 10.0424 9.0406 10.0569L12.2312 12.9241V12.9234L12.4633 13.1547L12.4505 13.0614L12.4635 13.1557L12.547 13.758L13.4992 20.6374C13.485 20.6214 13.4698 20.6051 13.4553 20.5908ZM20.7613 2.24424L12.5923 0.0682754C11.4835 -0.226962 10.7082 0.463148 10.8662 1.60078L12.1089 10.5924L12.0591 10.5304L12.0471 10.5147L8.34083 6.52052C8.333 6.51169 8.327 6.50585 8.32133 6.49819C7.98361 6.08532 7.42829 6.12714 6.86464 6.69579L3.57104 10.0127C2.76264 10.8265 1.96606 12.4221 1.80195 13.5591L0.0221919 25.8008C-0.142588 26.9367 0.628328 28.1072 1.7348 28.4036L9.90365 30.5794C11.0125 30.8746 11.7877 30.1847 11.6298 29.0469L10.3868 20.0553L10.4368 20.1173L10.4488 20.1328L14.1551 24.127C14.1629 24.136 14.1689 24.1418 14.1746 24.1493C14.5123 24.5622 15.0676 24.5203 15.6315 23.9519L18.9249 20.6349C19.7333 19.821 20.5299 18.2254 20.694 17.0884L22.4737 4.84689C22.6385 3.71109 21.8676 2.54064 20.7613 2.24424Z"
              fill="#F54811"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M36.5934 24.5823C36.555 24.851 36.3034 25.0702 36.0345 25.0702H33.2719C33.0028 25.0702 32.8147 24.851 32.8518 24.5823L34.2434 14.7073C34.2434 14.4838 34.1793 14.3155 34.0517 14.2032C33.9233 14.0914 33.8847 14.0872 33.8847 14.0872C33.6172 14.0588 33.179 14.0355 32.9095 14.0355H31.4516C31.1098 14.0355 30.7683 14.0616 30.4267 14.1133L30.0854 14.1646C29.8364 14.2214 29.6016 14.4873 29.5639 14.7563L28.1902 24.5823C28.1526 24.8508 27.9022 25.0702 27.6329 25.0702H24.8701C24.6024 25.0702 24.4126 24.8508 24.45 24.5823L26.2098 11.9128C26.2473 11.6448 26.4974 11.4252 26.7667 11.4252H29.1702C29.4387 11.4252 29.6587 11.6472 29.6587 11.9181V12.8209C30.0854 12.2693 30.6399 11.8995 31.3236 11.7097C32.0063 11.5201 33.3197 11.4511 33.3197 11.4511C33.5888 11.4369 34.0276 11.4252 34.2967 11.4252H35.0891C35.6862 11.4252 36.1808 11.4805 36.5739 11.5894C36.9664 11.6989 37.2792 11.8634 37.5089 12.0828C37.7396 12.3014 37.898 12.5755 37.9834 12.9036C38.0678 13.2323 38.0859 13.5861 38.0859 13.5861C38.0999 13.8572 38.0796 14.2977 38.0409 14.5661L36.5934 24.5823Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M45.5536 8.34961C45.5135 8.62647 45.2405 8.85297 44.9475 8.85297H41.9341C41.6398 8.85297 41.4334 8.62647 41.4734 8.34961L41.8023 6.08063C41.8426 5.80419 42.115 5.57727 42.409 5.57727H45.4229C45.7159 5.57727 45.9231 5.80419 45.883 6.08063L45.5536 8.34961ZM43.1516 24.5674C43.1108 24.8443 42.8378 25.0702 42.5441 25.0702H39.5301C39.2362 25.0702 39.0303 24.8443 39.0704 24.5674L40.9909 11.5127C41.0322 11.2358 41.3052 11.0095 41.5984 11.0095H44.612C44.9054 11.0095 45.112 11.2358 45.0714 11.5127L43.1516 24.5674Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M56.4024 13.4469C56.3649 13.7186 56.1099 13.9401 55.8365 13.9401H52.4496C52.1764 13.9401 51.92 14.1618 51.8805 14.4321L50.8829 21.2501V21.6019C50.8829 21.7192 50.905 21.8283 50.9488 21.9287C50.9915 22.0291 51.0697 22.1089 51.1831 22.1672L51.296 22.2255C51.5136 22.2424 51.9157 22.2553 52.1895 22.2553H54.5582C54.8322 22.2553 55.0262 22.477 54.9889 22.748L54.7949 24.1846C53.978 24.5834 53.1826 24.8319 52.4084 24.9271C51.6349 25.0226 51.0134 25.0702 50.5438 25.0702C50.022 25.0702 49.5439 25.0414 49.1099 24.9817C48.6748 24.923 48.3014 24.796 47.9879 24.6014C47.675 24.4069 47.4319 24.119 47.2577 23.7392C47.0834 23.3583 47.0347 22.7268 47.0347 22.7268C47.0146 22.4535 47.0287 22.0093 47.0682 21.7383L48.1256 14.4324C48.1649 14.1618 47.9731 13.9401 47.6993 13.9401H46.3207C46.0469 13.9401 45.8549 13.7186 45.8924 13.4469L46.0935 12.0079C46.1318 11.7373 46.3866 11.5158 46.66 11.5158H48.0382C48.3124 11.5158 48.568 11.2943 48.6067 11.0233L48.9865 8.38489C49.0256 8.1141 49.2797 7.86805 49.5517 7.8384L52.3708 7.52956C52.6421 7.4999 52.8341 7.69727 52.7952 7.96827L52.3614 11.0231C52.3231 11.2943 52.5159 11.5158 52.7893 11.5158H56.1758C56.4492 11.5158 56.6416 11.7373 56.6041 12.0079L56.4024 13.4469Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M67.0003 14.0896C66.9611 14.3589 66.6913 14.5781 66.4011 14.5781H65.0806C64.8956 14.5781 64.6294 14.5868 64.2801 14.6034C63.9307 14.6205 63.558 14.6456 63.1627 14.6793C62.7675 14.7125 62.3867 14.7509 62.0186 14.7926C61.6498 14.8348 61.6466 14.8358 61.6466 14.8358C61.3663 14.9023 61.1026 15.1761 61.0621 15.4447L59.6661 24.5823C59.6252 24.851 59.3549 25.0702 59.0658 25.0702H56.0914C55.8014 25.0702 55.5985 24.851 55.6389 24.5823L57.5331 11.9134C57.5735 11.6446 57.8432 11.4252 58.1323 11.4252H60.6927C60.9825 11.4252 61.2192 11.6472 61.2192 11.9181V13.0017C61.752 12.6053 62.3867 12.2438 63.1215 11.9167C63.8577 11.5894 64.7486 11.4252 65.7975 11.4252H66.5969H66.8722C67.1606 11.4252 67.364 11.6446 67.3247 11.9134L67.0003 14.0896Z"
              fill="white"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M74.7881 14.1131H72.7847C72.3278 14.1131 71.9498 14.1975 71.6511 14.3656C71.3527 14.5335 71.2383 14.8502 71.2383 14.8502C71.1471 15.1057 71.0369 15.5346 70.9968 15.8026L70.1219 21.4689C70.1219 21.7421 70.2452 21.9621 70.4919 22.1304C70.7374 22.2989 71.0462 22.3307 71.0462 22.3307C71.321 22.3591 71.7727 22.3833 72.0484 22.3833H73.5222C73.9788 22.3833 74.3617 22.294 74.6696 22.118C74.9755 21.942 75.0764 21.6478 75.0764 21.6478C75.1637 21.3905 75.27 20.9612 75.312 20.6933L76.1852 15.0745C76.1852 14.4329 75.7192 14.1131 74.7881 14.1131ZM79.1366 20.8191C79.0134 21.6423 78.7813 22.3307 78.4382 22.8823C78.0955 23.4348 77.6645 23.8712 77.1466 24.1928C76.6286 24.5142 76.0263 24.7419 75.3414 24.8725C74.6558 25.0041 73.6295 25.0485 73.6295 25.0485C73.3534 25.0601 72.9013 25.0702 72.6244 25.0702H71.1498C70.3594 25.0702 69.6651 25.0122 69.0674 24.8972C68.4703 24.7819 67.9646 24.5846 67.5531 24.3041C67.1388 24.0241 66.8313 23.6451 66.63 23.1672C66.4271 22.6888 66.3632 21.8295 66.3632 21.8295C66.3434 21.559 66.3583 21.1179 66.3982 20.8499L67.1963 15.3805C67.3022 14.6547 67.5394 14.0416 67.9082 13.5391C68.2771 13.036 68.7294 12.6286 69.2655 12.3153C69.8022 12.0029 70.3945 11.7758 71.0449 11.6354C71.6941 11.4953 72.546 11.4515 72.546 11.4515C72.8217 11.4369 73.2746 11.4252 73.5509 11.4252H75.3153C75.9999 11.4252 76.6333 11.4868 77.2122 11.6103C77.7925 11.7342 78.2891 11.936 78.7021 12.216C79.1147 12.4964 79.4396 12.8638 79.677 13.3162C79.9147 13.7698 79.986 14.5183 79.986 14.5183C80.0121 14.7892 79.9993 15.2288 79.9575 15.4973L79.1366 20.8191Z"
              fill="white"
            />
          </svg>
        </div>

        <div className="toolbar-sep" />

        <button className="tb-btn" onClick={() => handleRotate(-90)} title="Rotate left">↺</button>
        <button className="tb-btn" onClick={() => handleRotate(90)} title="Rotate right">↻</button>

        <div className="toolbar-sep" />

        <span className="tb-info">{totalPages > 0 ? `${totalPages} pages` : ""}</span>

        {statusMsg && <span className="tb-status">{statusMsg}</span>}

        <button
          className="tb-save"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* ── PDF Pages ── */}
      <div className="pages-area">
        <PdfViewer
          pdfBytes={pdfBytes}
          rotations={rotations}
          currentPage={currentPage}
          zoom={zoom}
          onTotalPages={handleTotalPages}
        />
      </div>

      {/* ── Bottom bar ── */}
      <div className="bottombar">
        <div className="bb-nav">
          <button className="bb-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage(1)}>⏮</button>
          <button className="bb-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>◀</button>
          <span className="bb-label">{currentPage} / {totalPages}</span>
          <button className="bb-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>▶</button>
          <button className="bb-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(totalPages)}>⏭</button>
        </div>
        <div className="bb-zoom">
          <button className="bb-btn" disabled={zoom <= 0.5} onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</button>
          <span className="bb-label">{Math.round(zoom * 100)}%</span>
          <button className="bb-btn" disabled={zoom >= 3.0} onClick={() => setZoom(z => Math.min(3.0, z + 0.25))}>+</button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<NitroPdfViewer />);
