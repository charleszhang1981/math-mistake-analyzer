import { describe, expect, it } from "vitest";

import { resolveReanswerMistakeFields } from "@/lib/reanswer-utils";
import type { StructuredQuestionJson } from "@/lib/ai/structured-json";
import type { ReanswerResult } from "@/lib/ai/types";

function makeStructured(studentSteps: string[], whyWrong = "旧 why", fixSuggestion = "旧 how"): StructuredQuestionJson {
    return {
        version: "v2",
        problem: {
            stage: "junior_high",
            topic: "ratio",
            question_markdown: "Q",
            given: [],
            ask: "Q",
            fontSizeHint: "normal",
        },
        student: {
            final_answer_markdown: "A",
            steps: [],
        },
        knowledge: {
            tags: [],
        },
        solution: {
            finalAnswer: "A",
            steps: ["S1"],
        },
        mistake: {
            studentSteps,
            studentAnswer: null,
            wrongStepIndex: 2,
            whyWrong,
            fixSuggestion,
        },
        rootCause: {
            studentHypothesis: "",
            confirmedCause: "",
            chatSummary: "",
        },
    };
}

function makeResult(partial: Partial<ReanswerResult>): ReanswerResult {
    return {
        answerText: "A",
        analysis: "summary",
        knowledgePoints: [],
        ...partial,
    };
}

describe("reanswer-utils", () => {
    it("uses new H when reanswer returns meaningful student steps", () => {
        const result = resolveReanswerMistakeFields(
            makeStructured(["旧步骤 1", "旧步骤 2"]),
            makeResult({
                mistakeStudentSteps: ["新步骤 1", "新步骤 2"],
                mistakeWrongStepIndex: 1,
                mistakeWhyWrong: "新 why",
                mistakeFixSuggestion: "新 how",
            })
        );

        expect(result).toEqual({
            mistakeStudentSteps: ["新步骤 1", "新步骤 2"],
            mistakeWrongStepIndex: 1,
            mistakeWhyWrong: "新 why",
            mistakeFixSuggestion: "新 how",
            preservedPrevious: false,
        });
    });

    it("preserves old H when reanswer returns placeholder-only student steps", () => {
        const result = resolveReanswerMistakeFields(
            makeStructured(["旧步骤 1", "旧步骤 2"], "旧 why", "旧 how"),
            makeResult({
                mistakeStudentSteps: ["(无)"],
                mistakeWrongStepIndex: null,
                mistakeWhyWrong: "无学生步骤供分析",
                mistakeFixSuggestion: "请参考标准步骤",
            })
        );

        expect(result).toEqual({
            mistakeStudentSteps: ["旧步骤 1", "旧步骤 2"],
            mistakeWrongStepIndex: 2,
            mistakeWhyWrong: "旧 why",
            mistakeFixSuggestion: "旧 how",
            preservedPrevious: true,
        });
    });

    it("collapses placeholder H to empty values when no previous meaningful H exists", () => {
        const result = resolveReanswerMistakeFields(
            makeStructured(["(无)"], "", ""),
            makeResult({
                mistakeStudentSteps: ["none"],
                mistakeWrongStepIndex: null,
                mistakeWhyWrong: "无学生步骤供分析",
                mistakeFixSuggestion: "N/A",
            })
        );

        expect(result).toEqual({
            mistakeStudentSteps: [],
            mistakeWrongStepIndex: null,
            mistakeWhyWrong: "",
            mistakeFixSuggestion: "",
            preservedPrevious: false,
        });
    });
});
