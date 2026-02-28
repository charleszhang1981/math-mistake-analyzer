import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("openai", () => ({
    AzureOpenAI: class MockAzureOpenAI {
        chat = {
            completions: {
                create: vi.fn(),
            },
        };
    },
}));

vi.mock("@/lib/logger", () => ({
    createLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        box: vi.fn(),
        divider: vi.fn(),
    })),
}));

vi.mock("@/lib/config", () => ({
    getAppConfig: vi.fn(() => ({
        aiProvider: "azure",
        azure: {
            apiKey: "test-key",
            endpoint: "https://test.openai.azure.com",
            deploymentName: "gpt-4o",
            apiVersion: "2024-02-15-preview",
        },
    })),
}));

vi.mock("@/lib/ai/tag-service", () => ({
    getMathTagsFromDB: vi.fn(() => Promise.resolve([])),
    getTagsFromDB: vi.fn(() => Promise.resolve([])),
}));

import { AzureOpenAIProvider } from "@/lib/ai/azure-provider";

describe("optional structured tags parser compatibility", () => {
    let provider: AzureOpenAIProvider;

    beforeEach(() => {
        provider = new AzureOpenAIProvider({
            apiKey: "test-key",
            endpoint: "https://test.openai.azure.com",
            deploymentName: "gpt-4o",
        });
    });

    it("keeps legacy parsing path working when optional tags are absent", () => {
        const xml = `
<question_text>Solve x + 2 = 5</question_text>
<answer_text>x = 3</answer_text>
<analysis>Move +2 to the other side.</analysis>
<subject>数学</subject>
<knowledge_points>一元一次方程</knowledge_points>
        `.trim();

        const parsed = (provider as any).parseResponse(xml);

        expect(parsed.questionText).toBe("Solve x + 2 = 5");
        expect(parsed.answerText).toBe("x = 3");
        expect(parsed.analysis).toContain("Move +2");
        expect(parsed.solutionFinalAnswer).toBeUndefined();
        expect(parsed.solutionSteps).toEqual([]);
    });

    it("parses optional G/H structured tags when present", () => {
        const xml = `
<question_text>Solve x + 2 = 5</question_text>
<answer_text>x = 3</answer_text>
<analysis>Legacy analysis text</analysis>
<subject>数学</subject>
<knowledge_points>一元一次方程</knowledge_points>
<solution_final_answer>x = 3</solution_final_answer>
<solution_steps>Subtract 2 on both sides||x = 3</solution_steps>
<mistake_student_steps>x + 2 = 5||x = 5</mistake_student_steps>
<mistake_wrong_step_index>2</mistake_wrong_step_index>
<mistake_why_wrong>Forgot to subtract 2.</mistake_why_wrong>
<mistake_fix_suggestion>Apply the same operation to both sides.</mistake_fix_suggestion>
        `.trim();

        const parsed = (provider as any).parseResponse(xml);

        expect(parsed.solutionFinalAnswer).toBe("x = 3");
        expect(parsed.solutionSteps).toEqual(["Subtract 2 on both sides", "x = 3"]);
        expect(parsed.mistakeStudentSteps).toEqual(["x + 2 = 5", "x = 5"]);
        expect(parsed.mistakeWrongStepIndex).toBe(2);
        expect(parsed.mistakeWhyWrong).toBe("Forgot to subtract 2.");
        expect(parsed.mistakeFixSuggestion).toBe("Apply the same operation to both sides.");
    });
});
