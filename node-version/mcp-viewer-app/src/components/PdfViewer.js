import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).href;
export function PdfViewer({ pdfBytes, rotations, currentPage, zoom, onTotalPages }) {
    const canvasRef = useRef(null);
    const [pdfDoc, setPdfDoc] = useState(null);
    // Load PDF document
    useEffect(() => {
        let cancelled = false;
        pdfjsLib.getDocument({ data: pdfBytes }).promise.then((doc) => {
            if (!cancelled) {
                setPdfDoc(doc);
                onTotalPages(doc.numPages);
            }
        });
        return () => { cancelled = true; };
    }, [pdfBytes, onTotalPages]);
    // Render current page
    useEffect(() => {
        if (!pdfDoc || !canvasRef.current)
            return;
        let cancelled = false;
        const render = async () => {
            const page = await pdfDoc.getPage(currentPage);
            if (cancelled)
                return;
            const naturalRot = page.rotate;
            const ourDelta = rotations[currentPage - 1] ?? 0;
            const totalRot = (naturalRot + ourDelta) % 360;
            const containerW = canvasRef.current.parentElement?.clientWidth ?? 800;
            const baseVp = page.getViewport({ scale: 1.0, rotation: totalRot });
            const fitScale = containerW / baseVp.width;
            const vp = page.getViewport({ scale: fitScale * zoom, rotation: totalRot });
            const canvas = canvasRef.current;
            const dpr = window.devicePixelRatio || 1;
            const cw = Math.floor(vp.width);
            const ch = Math.floor(vp.height);
            canvas.width = cw * dpr;
            canvas.height = ch * dpr;
            canvas.style.width = `${cw}px`;
            canvas.style.height = `${ch}px`;
            const ctx = canvas.getContext("2d");
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
        };
        render();
        return () => { cancelled = true; };
    }, [pdfDoc, currentPage, rotations, zoom]);
    return (_jsx("div", { className: "canvas-container", children: _jsx("canvas", { ref: canvasRef, className: "pdf-canvas" }) }));
}
