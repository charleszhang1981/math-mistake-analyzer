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

const REANSWER_XML = `
<answer_text>27/20</answer_text>
<analysis>简短分析</analysis>
<knowledge_points>分数除法, 比的化简</knowledge_points>
<solution_final_answer>27/20</solution_final_answer>
<solution_steps>步骤1\n步骤2</solution_steps>
<mistake_student_steps>学生步骤1\n学生步骤2</mistake_student_steps>
<mistake_wrong_step_index>2</mistake_wrong_step_index>
<mistake_why_wrong>把除法误作乘倒数</mistake_why_wrong>
<mistake_fix_suggestion>先取除数倒数再乘</mistake_fix_suggestion>
`.trim();

describe("reanswer prompt routing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("OpenAI reanswer uses the dedicated reanswer prompt", async () => {
        const provider = new OpenAIProvider({
            apiKey: "test-key",
            model: "gpt-4o",
        });

        const createMock = (provider as unknown as OpenAIProviderWithClient).openai.chat.completions.create;
        createMock.mockResolvedValue({
            choices: [{ message: { content: REANSWER_XML } }],
        });

        await provider.reanswerQuestion("题目文本", "zh", "数学");

        const systemPrompt = createMock.mock.calls[0][0].messages[0].content;
        expect(systemPrompt).toContain("Subject hint:");
        expect(systemPrompt).toContain("Subject: 数学");
        expect(systemPrompt).not.toContain("Student steps (optional):");
    });

    it("Gemini reanswer uses the dedicated reanswer prompt", async () => {
        const provider = new GeminiProvider({
            apiKey: "test-key",
            model: "gemini-2.5-flash",
        });

        const generateContentMock = (provider as unknown as GeminiProviderWithClient).ai.models.generateContent;
        generateContentMock.mockResolvedValue({
            text: REANSWER_XML,
        });

        await provider.reanswerQuestion("题目文本", "zh", "数学");

        const prompt = generateContentMock.mock.calls[0][0].contents;
        expect(typeof prompt).toBe("string");
        expect(prompt).toContain("Subject hint:");
        expect(prompt).toContain("Subject: 数学");
        expect(prompt).not.toContain("Student steps (optional):");
    });

    it("Azure reanswer uses the dedicated reanswer prompt", async () => {
        const provider = new AzureOpenAIProvider({
            apiKey: "test-key",
            endpoint: "https://test.openai.azure.com",
            deploymentName: "gpt-4o",
        });

        const createMock = (provider as unknown as AzureProviderWithClient).client.chat.completions.create;
        createMock.mockResolvedValue({
            choices: [{ message: { content: REANSWER_XML } }],
        });

        await provider.reanswerQuestion("题目文本", "zh", "数学");

        const systemPrompt = createMock.mock.calls[0][0].messages[0].content;
        expect(systemPrompt).toContain("Subject hint:");
        expect(systemPrompt).toContain("Subject: 数学");
        expect(systemPrompt).not.toContain("Student steps (optional):");
    });
});
