import { createLogger } from './logger';

const logger = createLogger('config');

// OpenAI 实例配置
export interface OpenAIInstance {
    id: string;
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
}

export interface AppConfig {
    aiProvider: 'gemini' | 'openai' | 'azure';
    allowRegistration?: boolean;
    openai?: {
        instances?: OpenAIInstance[];
        activeInstanceId?: string;
    };
    gemini?: {
        apiKey?: string;
        baseUrl?: string;
        model?: string;
    };
    azure?: {
        apiKey?: string;
        endpoint?: string;
        deploymentName?: string;
        apiVersion?: string;
        model?: string;
    };
    prompts?: {
        analyze?: string;
        similar?: string;
    };
    timeouts?: {
        analyze?: number;
    };
}

function getEnvConfig(): AppConfig {
    const defaultOpenAIInstance: OpenAIInstance | null = process.env.OPENAI_API_KEY
        ? {
            id: 'env-default',
            name: 'Default (ENV)',
            apiKey: process.env.OPENAI_API_KEY,
            baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
            model: process.env.OPENAI_MODEL || 'gpt-4o',
        }
        : null;

    const timeoutFromEnv = Number.parseInt(process.env.AI_ANALYZE_TIMEOUT_MS || '180000', 10);

    return {
        aiProvider: (process.env.AI_PROVIDER as 'gemini' | 'openai' | 'azure') || 'gemini',
        allowRegistration: process.env.ALLOW_REGISTRATION
            ? process.env.ALLOW_REGISTRATION.toLowerCase() === 'true'
            : true,
        openai: {
            instances: defaultOpenAIInstance ? [defaultOpenAIInstance] : [],
            activeInstanceId: defaultOpenAIInstance?.id,
        },
        gemini: {
            apiKey: process.env.GOOGLE_API_KEY,
            baseUrl: process.env.GEMINI_BASE_URL,
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        },
        azure: {
            apiKey: process.env.AZURE_OPENAI_API_KEY,
            endpoint: process.env.AZURE_OPENAI_ENDPOINT,
            deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT,
            apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
            model: process.env.AZURE_OPENAI_MODEL || 'gpt-4o',
        },
        prompts: {
            analyze: process.env.AI_PROMPT_ANALYZE || '',
            similar: process.env.AI_PROMPT_SIMILAR || '',
        },
        timeouts: {
            analyze: Number.isFinite(timeoutFromEnv) ? timeoutFromEnv : 180000,
        },
    };
}

export function getAppConfig(): AppConfig {
    return getEnvConfig();
}

export function updateAppConfig(_newConfig: Partial<AppConfig>) {
    logger.warn('Ignoring settings update because config is env-only (C1 policy)');
    throw new Error('CONFIG_ENV_ONLY');
}

export function getActiveOpenAIConfig(): OpenAIInstance | undefined {
    const config = getAppConfig();
    const instances = config.openai?.instances || [];
    const activeId = config.openai?.activeInstanceId;

    if (!activeId || instances.length === 0) {
        return undefined;
    }

    return instances.find((instance) => instance.id === activeId);
}

// 仅支持环境变量配置，实例数固定 1
export const MAX_OPENAI_INSTANCES = 1;
