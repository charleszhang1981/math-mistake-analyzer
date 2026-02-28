import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@google/genai', () => {
    return {
        GoogleGenAI: class MockGoogleGenAI {
            models = {
                generateContent: vi.fn(),
            };
        },
    };
});

vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        box: vi.fn(),
    })),
}));

vi.mock('@/lib/config', () => ({
    getAppConfig: vi.fn(() => ({
        prompts: {},
    })),
}));

vi.mock('@/lib/ai/schema', () => ({
    safeParseImageExtract: vi.fn((data) => ({ success: true, data })),
    safeParseTextReason: vi.fn((data) => ({ success: true, data })),
    safeParseParsedQuestion: vi.fn((data) => ({ success: true, data })),
}));

// Mock tag service to avoid DB calls
vi.mock('@/lib/ai/tag-service', () => ({
    getMathTagsFromDB: vi.fn().mockResolvedValue([]),
    getTagsFromDB: vi.fn().mockResolvedValue([]),
}));

import { GeminiProvider } from '@/lib/ai/gemini-provider';

describe('GeminiProvider Retry Logic', () => {
    let provider: GeminiProvider;
    let mockGenerateContent: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        provider = new GeminiProvider({ apiKey: 'test-key' });
        // @ts-expect-error - accessing private property for testing
        mockGenerateContent = provider.ai.models.generateContent;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should retry on network error and eventually succeed', async () => {
        mockGenerateContent
            .mockRejectedValueOnce(new Error('fetch failed'))
            .mockRejectedValueOnce(new Error('network timeout'))
            .mockResolvedValueOnce({
                text: '<question_text>Q</question_text><requires_image>false</requires_image><student_steps_raw>step1</student_steps_raw>',
                usageMetadata: {},
            })
            .mockResolvedValueOnce({
                text: '<answer_text>A</answer_text><analysis>An</analysis><knowledge_points>k1</knowledge_points>',
                usageMetadata: {},
            });

        const result = await provider.analyzeImage('base64data');

        expect(result).toBeDefined();
        expect(result.questionText).toBe('Q');
        // stage1 with 2 retries + stage2 once
        expect(mockGenerateContent).toHaveBeenCalledTimes(4);
    });

    it('should throw immediately on non-retryable error', async () => {
        mockGenerateContent.mockRejectedValue(new Error('AI_AUTH_ERROR: Invalid API Key'));

        await expect(provider.analyzeImage('base64data'))
            .rejects
            .toThrow('AI_AUTH_ERROR');

        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('should give up after max retries', async () => {
        mockGenerateContent.mockRejectedValue(new Error('fetch failed'));

        await expect(provider.analyzeImage('base64data'))
            .rejects
            .toThrow('fetch failed');

        // 3 attempts total (1 initial + 2 retries)
        expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it('should retry on 503 service unavailable', async () => {
        mockGenerateContent
            .mockRejectedValueOnce(new Error('503 Service Unavailable'))
            .mockResolvedValueOnce({
                text: '<question_text>Q</question_text><requires_image>false</requires_image>',
                usageMetadata: {},
            })
            .mockResolvedValueOnce({
                text: '<answer_text>A</answer_text><analysis>An</analysis><knowledge_points>k1</knowledge_points>',
                usageMetadata: {},
            });

        const result = await provider.analyzeImage('base64data');

        expect(result).toBeDefined();
        expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it('should retry on connection reset', async () => {
        mockGenerateContent
            .mockRejectedValueOnce(new Error('ECONNRESET'))
            .mockResolvedValueOnce({
                text: '<question_text>Q</question_text><requires_image>false</requires_image>',
                usageMetadata: {},
            })
            .mockResolvedValueOnce({
                text: '<answer_text>A</answer_text><analysis>An</analysis><knowledge_points>k1</knowledge_points>',
                usageMetadata: {},
            });

        const result = await provider.analyzeImage('base64data');

        expect(result).toBeDefined();
        expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });
});