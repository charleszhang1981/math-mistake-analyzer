/**
 * 应用配置模块单元测试（C1：仅环境变量）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = { ...process.env };

describe('config module (env-only)', () => {
    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('returns env-based defaults', async () => {
        delete process.env.AI_PROVIDER;
        delete process.env.OPENAI_API_KEY;

        const { getAppConfig } = await import('@/lib/config');
        const config = getAppConfig();

        expect(config.aiProvider).toBe('gemini');
        expect(config.allowRegistration).toBe(true);
        expect(config.openai?.instances?.length).toBe(0);
    });

    it('reads provider and model from env', async () => {
        process.env.AI_PROVIDER = 'openai';
        process.env.OPENAI_API_KEY = 'sk-env';
        process.env.OPENAI_MODEL = 'gpt-4.1-mini';

        const { getAppConfig, getActiveOpenAIConfig } = await import('@/lib/config');
        const config = getAppConfig();
        const active = getActiveOpenAIConfig();

        expect(config.aiProvider).toBe('openai');
        expect(active?.apiKey).toBe('sk-env');
        expect(active?.model).toBe('gpt-4.1-mini');
    });

    it('updateAppConfig is blocked by C1 policy', async () => {
        const { updateAppConfig } = await import('@/lib/config');
        expect(() => updateAppConfig({ aiProvider: 'openai' })).toThrow('CONFIG_ENV_ONLY');
    });
});
