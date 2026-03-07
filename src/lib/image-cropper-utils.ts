import type { Crop } from "react-image-crop";

export interface PercentRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Point2D {
    x: number;
    y: number;
}

const DEFAULT_CROP_MARGIN_PERCENT = 1;
const MIN_RECT_PERCENT = 0.5;

function clampPercent(value: number): number {
    return Math.min(100, Math.max(0, value));
}

export function createNearFullCrop(): Crop {
    return {
        unit: "%",
        x: DEFAULT_CROP_MARGIN_PERCENT,
        y: DEFAULT_CROP_MARGIN_PERCENT,
        width: 100 - DEFAULT_CROP_MARGIN_PERCENT * 2,
        height: 100 - DEFAULT_CROP_MARGIN_PERCENT * 2,
    };
}

export function normalizeOverlayRect(start: Point2D, end: Point2D): PercentRect | null {
    const left = clampPercent(Math.min(start.x, end.x));
    const right = clampPercent(Math.max(start.x, end.x));
    const top = clampPercent(Math.min(start.y, end.y));
    const bottom = clampPercent(Math.max(start.y, end.y));

    const width = right - left;
    const height = bottom - top;

    if (width < MIN_RECT_PERCENT || height < MIN_RECT_PERCENT) {
        return null;
    }

    return {
        x: left,
        y: top,
        width,
        height,
    };
}

export function mapOverlayRectToImageRect(crop: Crop, overlayRect: PercentRect): PercentRect {
    return {
        x: crop.x + (overlayRect.x / 100) * crop.width,
        y: crop.y + (overlayRect.y / 100) * crop.height,
        width: (overlayRect.width / 100) * crop.width,
        height: (overlayRect.height / 100) * crop.height,
    };
}

export function projectImageRectIntoCrop(crop: Crop, imageRect: PercentRect): PercentRect | null {
    const cropRight = crop.x + crop.width;
    const cropBottom = crop.y + crop.height;
    const rectRight = imageRect.x + imageRect.width;
    const rectBottom = imageRect.y + imageRect.height;

    const intersectionLeft = Math.max(crop.x, imageRect.x);
    const intersectionTop = Math.max(crop.y, imageRect.y);
    const intersectionRight = Math.min(cropRight, rectRight);
    const intersectionBottom = Math.min(cropBottom, rectBottom);

    if (intersectionRight <= intersectionLeft || intersectionBottom <= intersectionTop) {
        return null;
    }

    return {
        x: ((intersectionLeft - crop.x) / crop.width) * 100,
        y: ((intersectionTop - crop.y) / crop.height) * 100,
        width: ((intersectionRight - intersectionLeft) / crop.width) * 100,
        height: ((intersectionBottom - intersectionTop) / crop.height) * 100,
    };
}
