export interface MobileExportContext {
    viewportWidth: number;
    hasCoarsePointer: boolean;
    userAgent?: string;
}

export interface PdfPageSlice {
    offsetY: number;
    height: number;
}

export interface PdfContentBlock {
    offsetY: number;
    height: number;
}

export const MOBILE_EXPORT_A4_WIDTH_PX = 1120;

export const CANVAS_SAFE_THEME_VARS: Record<string, string> = {
    "--background": "#ffffff",
    "--foreground": "#171717",
    "--card": "#ffffff",
    "--card-foreground": "#171717",
    "--popover": "#ffffff",
    "--popover-foreground": "#171717",
    "--primary": "#171717",
    "--primary-foreground": "#fafafa",
    "--secondary": "#f5f5f5",
    "--secondary-foreground": "#171717",
    "--muted": "#f5f5f5",
    "--muted-foreground": "#737373",
    "--accent": "#f5f5f5",
    "--accent-foreground": "#171717",
    "--destructive": "#e40014",
    "--border": "#e5e5e5",
    "--input": "#e5e5e5",
    "--ring": "#a1a1a1",
    "--sidebar": "#fafafa",
    "--sidebar-foreground": "#0a0a0a",
    "--sidebar-primary": "#171717",
    "--sidebar-primary-foreground": "#fafafa",
    "--sidebar-accent": "#f5f5f5",
    "--sidebar-accent-foreground": "#171717",
    "--sidebar-border": "#e5e5e5",
    "--sidebar-ring": "#a1a1a1",
};

const MOBILE_USER_AGENT_PATTERN = /android|iphone|ipad|ipod|mobile|windows phone|harmonyos/i;

export function isLikelyMobilePdfExport(context: MobileExportContext): boolean {
    const userAgent = (context.userAgent || "").toLowerCase();

    if (MOBILE_USER_AGENT_PATTERN.test(userAgent)) {
        return true;
    }

    if (context.viewportWidth > 0 && context.viewportWidth < 768) {
        return true;
    }

    return context.hasCoarsePointer;
}

export function calculatePdfPageHeightPx(
    canvasWidth: number,
    pageWidthMm: number,
    pageHeightMm: number
): number {
    if (canvasWidth <= 0 || pageWidthMm <= 0 || pageHeightMm <= 0) {
        return 0;
    }

    return Math.floor(canvasWidth * (pageHeightMm / pageWidthMm));
}

export function buildPdfPageSlices(totalHeightPx: number, pageHeightPx: number): PdfPageSlice[] {
    if (totalHeightPx <= 0 || pageHeightPx <= 0) {
        return [];
    }

    const slices: PdfPageSlice[] = [];
    let offsetY = 0;

    while (offsetY < totalHeightPx) {
        const height = Math.min(pageHeightPx, totalHeightPx - offsetY);
        slices.push({ offsetY, height });
        offsetY += height;
    }

    return slices;
}

export function buildPdfPageSlicesFromBlocks(
    totalHeightPx: number,
    pageHeightPx: number,
    blocks: PdfContentBlock[]
): PdfPageSlice[] {
    if (totalHeightPx <= 0 || pageHeightPx <= 0) {
        return [];
    }

    const normalizedBlocks = blocks
        .map((block) => {
            const offsetY = Math.max(0, Math.floor(block.offsetY));
            const height = Math.max(0, Math.ceil(block.height));
            const remainingHeight = totalHeightPx - offsetY;

            return {
                offsetY,
                height: Math.min(height, Math.max(0, remainingHeight)),
            };
        })
        .filter((block) => block.height > 0 && block.offsetY < totalHeightPx)
        .sort((left, right) => left.offsetY - right.offsetY);

    if (normalizedBlocks.length === 0) {
        return buildPdfPageSlices(totalHeightPx, pageHeightPx);
    }

    const slices: PdfPageSlice[] = [];
    let currentPageStart = 0;

    for (const block of normalizedBlocks) {
        const blockStart = Math.max(block.offsetY, currentPageStart);
        const blockEnd = Math.min(totalHeightPx, block.offsetY + block.height);
        const blockHeight = blockEnd - blockStart;

        if (blockHeight <= 0) {
            continue;
        }

        const currentPageEnd = currentPageStart + pageHeightPx;
        if (blockEnd <= currentPageEnd) {
            continue;
        }

        if (blockHeight <= pageHeightPx && blockStart > currentPageStart) {
            slices.push({
                offsetY: currentPageStart,
                height: blockStart - currentPageStart,
            });
            currentPageStart = blockStart;
            continue;
        }

        while (blockEnd - currentPageStart > pageHeightPx) {
            slices.push({
                offsetY: currentPageStart,
                height: pageHeightPx,
            });
            currentPageStart += pageHeightPx;
        }
    }

    if (currentPageStart < totalHeightPx) {
        slices.push({
            offsetY: currentPageStart,
            height: totalHeightPx - currentPageStart,
        });
    }

    return slices.filter((slice) => slice.height > 0);
}

export function buildPrintPreviewPdfFilename(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `print-preview-${year}-${month}-${day}.pdf`;
}

export function applyCanvasSafeThemeVariables(root: HTMLElement): void {
    for (const [variableName, value] of Object.entries(CANVAS_SAFE_THEME_VARS)) {
        root.style.setProperty(variableName, value);
    }
}
