import { describe, expect, it } from "vitest";

import {
    createNearFullCrop,
    mapOverlayRectToImageRect,
    normalizeOverlayRect,
    projectImageRectIntoCrop,
} from "@/lib/image-cropper-utils";

describe("image-cropper-utils", () => {
    it("creates a near-full default crop", () => {
        expect(createNearFullCrop()).toEqual({
            unit: "%",
            x: 1,
            y: 1,
            width: 98,
            height: 98,
        });
    });

    it("normalizes a drag rectangle even when dragged backwards", () => {
        expect(
            normalizeOverlayRect(
                { x: 70, y: 60 },
                { x: 20, y: 10 }
            )
        ).toEqual({
            x: 20,
            y: 10,
            width: 50,
            height: 50,
        });
    });

    it("maps a local overlay rectangle to full-image percentages", () => {
        const result = mapOverlayRectToImageRect(
            { unit: "%", x: 10, y: 20, width: 80, height: 60 },
            { x: 25, y: 10, width: 50, height: 20 }
        );

        expect(result).toEqual({
            x: 30,
            y: 26,
            width: 40,
            height: 12,
        });
    });

    it("projects and clips an image rectangle into the current crop", () => {
        const result = projectImageRectIntoCrop(
            { unit: "%", x: 10, y: 20, width: 80, height: 60 },
            { x: 50, y: 40, width: 60, height: 50 }
        );

        expect(result).toEqual({
            x: 50,
            y: (20 / 60) * 100,
            width: 50,
            height: (40 / 60) * 100,
        });
    });

    it("returns null when an image rectangle is outside the crop", () => {
        const result = projectImageRectIntoCrop(
            { unit: "%", x: 10, y: 20, width: 30, height: 30 },
            { x: 60, y: 70, width: 10, height: 10 }
        );

        expect(result).toBeNull();
    });
});
