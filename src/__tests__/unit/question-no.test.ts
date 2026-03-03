import { describe, expect, it } from "vitest";
import { buildQuestionNo } from "@/lib/question-no";

describe("question number format", () => {
    it("pads to 3 digits for normal sequence", () => {
        expect(buildQuestionNo("20260302", 1)).toBe("20260302001");
        expect(buildQuestionNo("20260302", 12)).toBe("20260302012");
        expect(buildQuestionNo("20260302", 999)).toBe("20260302999");
    });

    it("keeps full digits when sequence exceeds 999", () => {
        expect(buildQuestionNo("20260302", 1000)).toBe("202603021000");
    });

    it("falls back to sequence 1 when input is invalid", () => {
        expect(buildQuestionNo("20260302", 0)).toBe("20260302001");
        expect(buildQuestionNo("20260302", Number.NaN)).toBe("20260302001");
    });
});
