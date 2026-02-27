import { describe, expect, it } from "vitest";
import { buildCheckerJson, buildDiagnosisJson } from "@/lib/math-checker";

describe("math-checker", () => {
    it("checks linear equation with explicit student answer source", () => {
        const checker = buildCheckerJson({
            questionText: "Solve equation 2x + 3 = 7",
            answerText: "x = 2",
            studentAnswerText: "x = 3",
        });

        expect(checker.type).toBe("linear_equation");
        expect(checker.checkable).toBe(true);
        expect(checker.standard_answer).toBe("2");
        expect(checker.student_answer).toBe("3");
        expect(checker.is_correct).toBe(false);
    });

    it("does not infer student answer from standard answer text in student mode", () => {
        const checker = buildCheckerJson({
            questionText: "Solve equation 2x + 3 = 7",
            answerText: "x = 2",
        });

        expect(checker.type).toBe("linear_equation");
        expect(checker.checkable).toBe(true);
        expect(checker.standard_answer).toBe("2");
        expect(checker.student_answer).toBeNull();
        expect(checker.is_correct).toBeNull();
    });

    it("supports answer verification mode for gating scenarios", () => {
        const checker = buildCheckerJson({
            questionText: "Solve equation 2x + 3 = 7",
            answerText: "x = 2",
            verificationMode: "answer",
        });

        expect(checker.type).toBe("linear_equation");
        expect(checker.checkable).toBe(true);
        expect(checker.is_correct).toBe(true);
    });

    it("normalizes powers/brackets in fraction arithmetic expressions", () => {
        const checker = buildCheckerJson({
            questionText: "$-3^2 - \\frac{1}{2} + \\frac{1}{3}[5 - (-1)^4]$",
            answerText: "-49/6",
            studentAnswerText: "55",
        });

        expect(checker.type).toBe("fraction_arithmetic");
        expect(checker.checkable).toBe(true);
        expect(checker.standard_answer).toBe("-49/6");
        expect(checker.student_answer).toBe("55");
        expect(checker.is_correct).toBe(false);
    });

    it("downgrades to uncheckable for unsupported patterns", () => {
        const checker = buildCheckerJson({
            questionText: "For the diagram, explain your reasoning.",
            answerText: "N/A",
        });

        expect(checker.checkable).toBe(false);
        expect(checker.type).toBe("unknown");
        expect(checker.is_correct).toBeNull();
    });

    it("builds diagnosis evidence with step pointer", () => {
        const checker = buildCheckerJson({
            questionText: "Solve equation x + 2 = 5",
            answerText: "x = 3",
            studentAnswerText: "x = -3",
        });

        const diagnosis = buildDiagnosisJson(
            {
                questionText: "Solve equation x + 2 = 5",
                analysis: "Student moved +2 without sign change.",
                structuredJson: {
                    mistake: {
                        studentSteps: ["x + 2 = 5", "x = 5 + 2"],
                    },
                },
            },
            checker,
        );

        expect(diagnosis.candidates.length).toBeGreaterThan(0);
        expect(diagnosis.candidates[0].evidence).toContain("step=");
    });
});
