import { describe, expect, it } from 'vitest';
import { normalizeAIError } from '@/lib/ai/error-normalizer';

describe('normalizeAIError', () => {
    it('maps retry-limit 429 errors to AI_QUOTA_EXCEEDED', () => {
        const result = normalizeAIError(
            new Error('exceeded retry limit, last status: 429 Too Many Requests, request id: 9228d0f5')
        );

        expect(result.code).toBe('AI_QUOTA_EXCEEDED');
        expect(result.status).toBe(429);
        expect(result.retryAfterSeconds).toBe(60);
    });

    it('maps known code directly', () => {
        const result = normalizeAIError(new Error('AI_TIMEOUT_ERROR'));

        expect(result.code).toBe('AI_TIMEOUT_ERROR');
        expect(result.status).toBe(504);
    });

    it('parses retry-after seconds when present', () => {
        const result = normalizeAIError('429 rate limit, retry-after: 15');

        expect(result.code).toBe('AI_QUOTA_EXCEEDED');
        expect(result.retryAfterSeconds).toBe(15);
    });
});

