import { describe, expect, it } from "vitest";
import { buildCheckerJson, buildDiagnosisJson } from "@/lib/math-checker";

describe("math-checker", () => {
    it("checks linear equation answers", () => {
        const checker = buildCheckerJson({
            questionText: "解方程 x + 2 = 5",
            answerText: "x = 4",
        });

        expect(checker.type).toBe("linear_equation");
        expect(checker.checkable).toBe(true);
        expect(checker.standard_answer).toBe("3");
        expect(checker.student_answer).toBe("4");
        expect(checker.is_correct).toBe(false);
    });

    it("checks fraction arithmetic answers", () => {
        const checker = buildCheckerJson({
            questionText: "计算 1/2 + 1/3 = ?",
            answerText: "5/6",
        });

        expect(checker.type).toBe("fraction_arithmetic");
        expect(checker.standard_answer).toBe("5/6");
        expect(checker.is_correct).toBe(true);
    });

    it("returns uncheckable for unsupported question patterns", () => {
        const checker = buildCheckerJson({
            questionText: "简答：谈谈你对数学学习的感受",
            answerText: "我觉得要多练习。",
        });

        expect(checker.type).toBe("unknown");
        expect(checker.checkable).toBe(false);
        expect(checker.is_correct).toBeNull();
    });

    it("builds diagnosis candidates from checker outputs", () => {
        const checker = buildCheckerJson({
            questionText: "解方程 x + 2 = 5",
            answerText: "x = -3",
        });

        const diagnosis = buildDiagnosisJson(
            {
                questionText: "解方程 x + 2 = 5",
                answerText: "x = -3",
                analysis: "移项后写成 x = -3",
            },
            checker
        );

        expect(diagnosis.candidates.length).toBeGreaterThan(0);
        expect(diagnosis.candidates[0].cause.length).toBeGreaterThan(0);
        expect(diagnosis.candidates[0].evidence.length).toBeGreaterThan(0);
    });
});
