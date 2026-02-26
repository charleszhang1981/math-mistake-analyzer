import { describe, expect, it } from "vitest";
import {
    buildStructuredQuestionJson,
    normalizeStructuredQuestionJson,
} from "@/lib/ai/structured-json";

describe("structured-json", () => {
    it("builds structuredJson from parsed question fields", () => {
        const result = buildStructuredQuestionJson({
            questionText: "解方程 x + 2 = 5",
            answerText: "x = 3",
            analysis: "第一步：移项\n第二步：化简",
        });

        expect(result).not.toBeNull();
        expect(result?.problem.topic).toBe("equation");
        expect(result?.problem.question_markdown).toBe("解方程 x + 2 = 5");
        expect(result?.student.final_answer_markdown).toBe("x = 3");
        expect(result?.student.steps).toEqual(["第一步：移项", "第二步：化简"]);
    });

    it("returns null when required text fields are missing", () => {
        expect(buildStructuredQuestionJson({ questionText: "", answerText: "x=1" })).toBeNull();
        expect(buildStructuredQuestionJson({ questionText: "题目", answerText: "" })).toBeNull();
    });

    it("normalizes valid structuredJson payload", () => {
        const normalized = normalizeStructuredQuestionJson({
            problem: {
                stage: "junior_high",
                topic: "equation",
                question_markdown: "解方程 x + 2 = 5",
                given: [],
                ask: "解方程 x + 2 = 5",
            },
            student: {
                final_answer_markdown: "x = 3",
                steps: ["移项", "化简"],
            },
        });

        expect(normalized).not.toBeNull();
        expect(normalized?.problem.stage).toBe("junior_high");
    });
});
