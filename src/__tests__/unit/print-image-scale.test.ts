import { describe, expect, it } from "vitest";

import {
    DEFAULT_PRINT_IMAGE_SCALE,
    normalizePrintImageScale,
    resolvePrintImageScale,
} from "@/lib/print-image-scale";

describe("print-image-scale", () => {
    it("falls back to 100 when no persisted value exists", () => {
        expect(DEFAULT_PRINT_IMAGE_SCALE).toBe(100);
        expect(resolvePrintImageScale(null)).toBe(100);
        expect(resolvePrintImageScale(undefined)).toBe(100);
        expect(resolvePrintImageScale("")).toBe(100);
    });

    it("uses the persisted scale when present", () => {
        expect(resolvePrintImageScale(95)).toBe(95);
        expect(resolvePrintImageScale("105")).toBe(105);
    });

    it("normalizes out-of-range values", () => {
        expect(normalizePrintImageScale(10)).toBe(50);
        expect(normalizePrintImageScale(999)).toBe(120);
    });
});
