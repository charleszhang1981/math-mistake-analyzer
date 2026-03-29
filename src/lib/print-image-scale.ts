export const PRINT_IMAGE_SCALE_MIN = 50;
export const PRINT_IMAGE_SCALE_MAX = 120;
export const PRINT_IMAGE_SCALE_STEP = 5;
export const DEFAULT_PRINT_IMAGE_SCALE = 100;

export function normalizePrintImageScale(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return null;
    }

    const rounded = Math.round(numeric);
    return Math.max(PRINT_IMAGE_SCALE_MIN, Math.min(PRINT_IMAGE_SCALE_MAX, rounded));
}

export function resolvePrintImageScale(persistedScale: unknown): number {
    return normalizePrintImageScale(persistedScale) ?? DEFAULT_PRINT_IMAGE_SCALE;
}
