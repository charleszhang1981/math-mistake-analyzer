import { describe, expect, it } from "vitest";
import {
    buildStructuredQuestionJson,
    normalizeStructuredQuestionJson,
} from "@/lib/ai/structured-json";

describe("structured-json", () => {
    it("prefers optional structured prefill fields when provided", () => {
        const result = buildStructuredQuestionJson({
            questionText: "Solve equation x + 2 = 5",
            answerText: "x = 3",
            analysis: "Legacy analysis text",
            fontSizeHint: "large",
            solutionFinalAnswer: "x = 3",
            solutionSteps: ["Subtract 2 on both sides", "x = 3"],
            mistakeStudentSteps: ["x + 2 = 5", "x = 5"],
            mistakeWrongStepIndex: 2,
            mistakeWhyWrong: "Forgot to subtract 2.",
            mistakeFixSuggestion: "Apply the same operation to both sides.",
        });

        expect(result).not.toBeNull();
        expect(result?.solution.finalAnswer).toBe("x = 3");
        expect(result?.solution.steps).toEqual(["Subtract 2 on both sides", "x = 3"]);
        expect(result?.mistake.studentSteps).toEqual(["x + 2 = 5", "x = 5"]);
        expect(result?.mistake.wrongStepIndex).toBe(1);
        expect(result?.mistake.whyWrong).toBe("Forgot to subtract 2.");
        expect(result?.mistake.fixSuggestion).toBe("Apply the same operation to both sides.");
        expect(result?.problem.fontSizeHint).toBe("large");
    });

    it("builds structuredJson v2 from parsed question fields", () => {
        const result = buildStructuredQuestionJson({
            questionText: "Solve equation x + 2 = 5",
            answerText: "x = 3",
            analysis: "Step 1: move constant\nStep 2: simplify",
        });

        expect(result).not.toBeNull();
        expect(result?.version).toBe("v2");
        expect(result?.problem.topic).toBe("equation");
        expect(result?.problem.question_markdown).toBe("Solve equation x + 2 = 5");
        expect(result?.problem.fontSizeHint).toBe("normal");
        expect(result?.student.final_answer_markdown).toBe("x = 3");
        expect(result?.student.steps).toEqual(["Step 1: move constant", "Step 2: simplify"]);
        expect(result?.knowledge.tags).toEqual([]);
        expect(result?.solution.finalAnswer).toBe("x = 3");
        expect(result?.mistake.studentSteps).toEqual(["Step 1: move constant", "Step 2: simplify"]);
    });

    it("falls back to analysis-derived steps when optional structured fields are missing", () => {
        const result = buildStructuredQuestionJson({
            questionText: "Compute 1/2 + 1/3",
            answerText: "5/6",
            analysis: "Find common denominator.\nAdd numerators.\nSimplify.",
            solutionFinalAnswer: "",
            solutionSteps: [],
            mistakeStudentSteps: [],
            mistakeWrongStepIndex: null,
            mistakeWhyWrong: "",
            mistakeFixSuggestion: "",
        });

        expect(result).not.toBeNull();
        expect(result?.solution.finalAnswer).toBe("5/6");
        expect(result?.solution.steps).toEqual(["Find common denominator.", "Add numerators.", "Simplify."]);
        expect(result?.mistake.studentSteps).toEqual(["Find common denominator.", "Add numerators.", "Simplify."]);
        expect(result?.mistake.wrongStepIndex).toBeNull();
    });

    it("returns null when required text fields are missing", () => {
        expect(buildStructuredQuestionJson({ questionText: "", answerText: "x=1" })).toBeNull();
        expect(buildStructuredQuestionJson({ questionText: "Question", answerText: "" })).toBeNull();
    });

    it("normalizes legacy payload into v2 shape", () => {
        const normalized = normalizeStructuredQuestionJson({
            problem: {
                stage: "junior_high",
                topic: "equation",
                question_markdown: "Solve equation x + 2 = 5",
                given: [],
                ask: "Solve equation x + 2 = 5",
            },
            student: {
                final_answer_markdown: "x = 3",
                steps: ["move constant", "simplify"],
            },
        });

        expect(normalized).not.toBeNull();
        expect(normalized?.version).toBe("v2");
        expect(normalized?.problem.stage).toBe("junior_high");
        expect(normalized?.solution.finalAnswer).toBe("x = 3");
        expect(normalized?.mistake.studentSteps).toEqual(["move constant", "simplify"]);
    });

    it("normalizes explicit v2 payload unchanged", () => {
        const normalized = normalizeStructuredQuestionJson({
            version: "v2",
            problem: {
                stage: "junior_high",
                topic: "fraction",
                question_markdown: "Compute 1/2 + 1/3",
                given: [],
                ask: "Compute 1/2 + 1/3",
            },
            student: {
                final_answer_markdown: "5/6",
                steps: ["common denominator", "add numerators"],
            },
            knowledge: {
                tags: [],
            },
            solution: {
                finalAnswer: "5/6",
                steps: ["common denominator", "add numerators"],
            },
            mistake: {
                studentSteps: [],
                studentAnswer: null,
                wrongStepIndex: null,
                whyWrong: "",
                fixSuggestion: "",
            },
            rootCause: {
                studentHypothesis: "",
                confirmedCause: "",
                chatSummary: "",
            },
        });

        expect(normalized).not.toBeNull();
        expect(normalized?.version).toBe("v2");
        expect(normalized?.problem.topic).toBe("fraction");
    });
});
