/**
 * /api/settings API 集成测试（C1：env-only）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    mockGetAppConfig: vi.fn(() => ({
        aiProvider: 'gemini',
        allowRegistration: true,
        gemini: {
            apiKey: 'AIza-test-key',
            model: 'gemini-2.5-flash',
        },
    })),
}));

vi.mock('@/lib/config', () => ({
    getAppConfig: mocks.mockGetAppConfig,
}));

import { GET, POST } from '@/app/api/settings/route';

describe('/api/settings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('GET returns env config', async () => {
        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.aiProvider).toBe('gemini');
        expect(data.gemini.apiKey).toBe('AIza-test-key');
    });

    it('POST is blocked by C1 policy', async () => {
        const request = new Request('http://localhost/api/settings', {
            method: 'POST',
            body: JSON.stringify({ aiProvider: 'openai' }),
            headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toBe('CONFIG_ENV_ONLY');
    });
});
