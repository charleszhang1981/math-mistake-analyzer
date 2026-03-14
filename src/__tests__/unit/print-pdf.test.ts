import { describe, expect, it } from "vitest";

import {
    applyCanvasSafeThemeVariables,
    buildPdfPageSlices,
    buildPdfPageSlicesFromBlocks,
    buildPrintPreviewPdfFilename,
    CANVAS_SAFE_THEME_VARS,
    calculatePdfPageHeightPx,
    isLikelyMobilePdfExport,
    MOBILE_EXPORT_A4_WIDTH_PX,
} from "@/lib/print-pdf";

describe("print-pdf helpers", () => {
    it("detects mobile export environment from mobile user agent", () => {
        expect(
            isLikelyMobilePdfExport({
                viewportWidth: 1280,
                hasCoarsePointer: false,
                userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
            })
        ).toBe(true);
    });

    it("detects mobile export environment from small width", () => {
        expect(
            isLikelyMobilePdfExport({
                viewportWidth: 390,
                hasCoarsePointer: false,
                userAgent: "Mozilla/5.0",
            })
        ).toBe(true);
    });

    it("returns false for desktop-like environment", () => {
        expect(
            isLikelyMobilePdfExport({
                viewportWidth: 1440,
                hasCoarsePointer: false,
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            })
        ).toBe(false);
    });

    it("calculates page slices for multi-page canvas", () => {
        const pageHeightPx = calculatePdfPageHeightPx(1200, 210, 297);
        const slices = buildPdfPageSlices(pageHeightPx * 2 + 300, pageHeightPx);

        expect(pageHeightPx).toBeGreaterThan(0);
        expect(slices).toEqual([
            { offsetY: 0, height: pageHeightPx },
            { offsetY: pageHeightPx, height: pageHeightPx },
            { offsetY: pageHeightPx * 2, height: 300 },
        ]);
    });

    it("keeps blocks intact when they fit on a new page", () => {
        const slices = buildPdfPageSlicesFromBlocks(2300, 1000, [
            { offsetY: 0, height: 650 },
            { offsetY: 650, height: 900 },
            { offsetY: 1550, height: 750 },
        ]);

        expect(slices).toEqual([
            { offsetY: 0, height: 650 },
            { offsetY: 650, height: 900 },
            { offsetY: 1550, height: 750 },
        ]);
    });

    it("falls back to internal slicing for oversized blocks", () => {
        const slices = buildPdfPageSlicesFromBlocks(2600, 1000, [
            { offsetY: 0, height: 700 },
            { offsetY: 700, height: 1500 },
            { offsetY: 2200, height: 400 },
        ]);

        expect(slices).toEqual([
            { offsetY: 0, height: 1000 },
            { offsetY: 1000, height: 1000 },
            { offsetY: 2000, height: 600 },
        ]);
    });

    it("builds dated pdf filename", () => {
        expect(buildPrintPreviewPdfFilename(new Date("2026-03-14T00:00:00Z"))).toBe("print-preview-2026-03-14.pdf");
    });

    it("uses a fixed desktop-like width for mobile export capture", () => {
        expect(MOBILE_EXPORT_A4_WIDTH_PX).toBeGreaterThan(1000);
    });

    it("applies canvas-safe theme variables to the root element", () => {
        const root = document.createElement("div");

        applyCanvasSafeThemeVariables(root);

        expect(root.style.getPropertyValue("--background")).toBe(CANVAS_SAFE_THEME_VARS["--background"]);
        expect(root.style.getPropertyValue("--muted-foreground")).toBe(CANVAS_SAFE_THEME_VARS["--muted-foreground"]);
        expect(root.style.getPropertyValue("--border")).toBe(CANVAS_SAFE_THEME_VARS["--border"]);
    });
});
