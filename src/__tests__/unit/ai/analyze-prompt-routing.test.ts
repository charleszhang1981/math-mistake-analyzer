import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("openai", () => {
    class MockOpenAI {
        chat = {
            completions: {
                create: vi.fn(),
            },
        };
    }

    class MockAzureOpenAI {
        chat = {
            completions: {
                create: vi.fn(),
            },
        };
    }

    return {
        default: MockOpenAI,
        AzureOpenAI: MockAzureOpenAI,
    };
});

vi.mock("@google/genai", () => ({
    GoogleGenAI: class MockGoogleGenAI {
        models = {
            generateContent: vi.fn(),
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
        aiProvider: "openai",
        ai: {
            analyzeStage1MaxTokens: 1200,
            analyzeStage2MaxTokens: 3200,
        },
        prompts: {
            analyze: "",
            similar: "",
        },
        openai: {
            instances: [],
        },
        gemini: {
            model: "gemini-2.5-flash",
            modelExtract: "gemini-2.5-flash",
            modelReason: "gemini-2.5-flash",
        },
        azure: {
            deploymentName: "gpt-4o",
            deploymentExtract: "gpt-4o",
            deploymentReason: "gpt-4o",
        },
    })),
}));

vi.mock("@/lib/ai/tag-service", () => ({
    getMathTagsFromDB: vi.fn(() => Promise.resolve([])),
    getTagsFromDB: vi.fn(() => Promise.resolve([])),
}));

vi.mock("jsonrepair", () => ({
    jsonrepair: vi.fn((value: string) => value),
}));

import { OpenAIProvider } from "@/lib/ai/openai-provider";
import { GeminiProvider } from "@/lib/ai/gemini-provider";
import { AzureOpenAIProvider } from "@/lib/ai/azure-provider";

type OpenAIProviderWithClient = {
    openai: {
        chat: {
            completions: {
                create: ReturnType<typeof vi.fn>;
            };
        };
    };
};

type GeminiProviderWithClient = {
    ai: {
        models: {
            generateContent: ReturnType<typeof vi.fn>;
        };
    };
};

type AzureProviderWithClient = {
    client: {
        chat: {
            completions: {
                create: ReturnType<typeof vi.fn>;
            };
        };
    };
};

const EXTRACT_XML = `
<requires_image>false</requires_image>
<question_text>Solve x + 2 = 5.</question_text>
<student_steps_raw>x + 2 = 5
x = 3</student_steps_raw>
`.trim();

const REASON_XML = `
<answer_text>x = 3</answer_text>
<analysis>Move 2 to the other side and solve.</analysis>
<knowledge_points>linear equations</knowledge_points>
<solution_final_answer>x = 3</solution_final_answer>
<solution_steps>Start with x + 2 = 5.
Subtract 2 from both sides to get x = 3.</solution_steps>
<mistake_student_steps>x + 2 = 5
x = 3</mistake_student_steps>
<mistake_wrong_step_index></mistake_wrong_step_index>
<mistake_why_wrong></mistake_why_wrong>
<mistake_fix_suggestion></mistake_fix_suggestion>
`.trim();

describe("analyze prompt routing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("OpenAI analyze reaches stage2 with the reason prompt", async () => {
        const provider = new OpenAIProvider({
            apiKey: "test-key",
            model: "gpt-4o",
        });

        const createMock = (provider as unknown as OpenAIProviderWithClient).openai.chat.completions.create;
        createMock
            .mockResolvedValueOnce({
                choices: [{ message: { content: EXTRACT_XML } }],
            })
            .mockResolvedValueOnce({
                choices: [{ message: { content: REASON_XML } }],
            });

        const result = await provider.analyzeImage("base64data", "image/jpeg", "en");

        expect(result.questionText).toBe("Solve x + 2 = 5.");
        expect(createMock).toHaveBeenCalledTimes(2);
        const stage2Prompt = createMock.mock.calls[1][0].messages[0].content;
        expect(stage2Prompt).toContain("Student steps (optional):");
        expect(stage2Prompt).toContain("Solve x + 2 = 5.");
    });

    it("Gemini analyze reaches stage2 with the reason prompt", async () => {
        const provider = new GeminiProvider({
            apiKey: "test-key",
            model: "gemini-2.5-flash",
        });

        const generateContentMock = (provider as unknown as GeminiProviderWithClient).ai.models.generateContent;
        generateContentMock
            .mockResolvedValueOnce({
                text: EXTRACT_XML,
            })
            .mockResolvedValueOnce({
                text: REASON_XML,
            });

        const result = await provider.analyzeImage("base64data", "image/jpeg", "en");

        expect(result.questionText).toBe("Solve x + 2 = 5.");
        expect(generateContentMock).toHaveBeenCalledTimes(2);
        const stage2Prompt = generateContentMock.mock.calls[1][0].contents;
        expect(typeof stage2Prompt).toBe("string");
        expect(stage2Prompt).toContain("Student steps (optional):");
        expect(stage2Prompt).toContain("Solve x + 2 = 5.");
    });

    it("Azure analyze reaches stage2 with the reason prompt", async () => {
        const provider = new AzureOpenAIProvider({
            apiKey: "test-key",
            endpoint: "https://test.openai.azure.com",
            deploymentName: "gpt-4o",
        });

        const createMock = (provider as unknown as AzureProviderWithClient).client.chat.completions.create;
        createMock
            .mockResolvedValueOnce({
                choices: [{ message: { content: EXTRACT_XML } }],
            })
            .mockResolvedValueOnce({
                choices: [{ message: { content: REASON_XML } }],
            });

        const result = await provider.analyzeImage("base64data", "image/jpeg", "en");

        expect(result.questionText).toBe("Solve x + 2 = 5.");
        expect(createMock).toHaveBeenCalledTimes(2);
        const stage2Prompt = createMock.mock.calls[1][0].messages[0].content;
        expect(stage2Prompt).toContain("Student steps (optional):");
        expect(stage2Prompt).toContain("Solve x + 2 = 5.");
    });
});
