export type AIErrorCode =
    | 'AI_CONNECTION_FAILED'
    | 'AI_TIMEOUT_ERROR'
    | 'AI_QUOTA_EXCEEDED'
    | 'AI_PERMISSION_DENIED'
    | 'AI_NOT_FOUND'
    | 'AI_RESPONSE_ERROR'
    | 'AI_AUTH_ERROR'
    | 'AI_SERVICE_UNAVAILABLE'
    | 'AI_UNKNOWN_ERROR';

export interface NormalizedAIError {
    code: AIErrorCode;
    message: string;
    status: number;
    retryAfterSeconds?: number;
}

const KNOWN_AI_CODES: AIErrorCode[] = [
    'AI_CONNECTION_FAILED',
    'AI_TIMEOUT_ERROR',
    'AI_QUOTA_EXCEEDED',
    'AI_PERMISSION_DENIED',
    'AI_NOT_FOUND',
    'AI_RESPONSE_ERROR',
    'AI_AUTH_ERROR',
    'AI_SERVICE_UNAVAILABLE',
    'AI_UNKNOWN_ERROR',
];

function extractMessage(error: unknown): string {
    if (error instanceof Error) return error.message || 'Unknown error';
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function inferAIErrorCode(message: string): AIErrorCode {
    for (const code of KNOWN_AI_CODES) {
        if (message.includes(code)) {
            return code;
        }
    }

    const lower = message.toLowerCase();

    if (
        lower.includes('429') ||
        lower.includes('rate limit') ||
        lower.includes('too many') ||
        lower.includes('quota') ||
        lower.includes('额度') ||
        lower.includes('exceeded retry limit')
    ) {
        return 'AI_QUOTA_EXCEEDED';
    }

    if (
        lower.includes('401') ||
        lower.includes('unauthorized') ||
        lower.includes('api key')
    ) {
        return 'AI_AUTH_ERROR';
    }

    if (
        lower.includes('403') ||
        lower.includes('forbidden') ||
        lower.includes('permission denied')
    ) {
        return 'AI_PERMISSION_DENIED';
    }

    if (
        lower.includes('404') ||
        lower.includes('not found')
    ) {
        return 'AI_NOT_FOUND';
    }

    if (
        lower.includes('timeout') ||
        lower.includes('timed out') ||
        lower.includes('aborted') ||
        lower.includes('408')
    ) {
        return 'AI_TIMEOUT_ERROR';
    }

    if (
        lower.includes('fetch failed') ||
        lower.includes('network') ||
        lower.includes('connect') ||
        lower.includes('enotfound') ||
        lower.includes('econnrefused') ||
        lower.includes('etimedout') ||
        lower.includes('econnreset')
    ) {
        return 'AI_CONNECTION_FAILED';
    }

    if (
        lower.includes('500') ||
        lower.includes('502') ||
        lower.includes('503') ||
        lower.includes('504') ||
        lower.includes('overloaded') ||
        lower.includes('unavailable')
    ) {
        return 'AI_SERVICE_UNAVAILABLE';
    }

    if (
        lower.includes('invalid json') ||
        lower.includes('parse') ||
        lower.includes('missing critical xml')
    ) {
        return 'AI_RESPONSE_ERROR';
    }

    return 'AI_UNKNOWN_ERROR';
}

function statusFromCode(code: AIErrorCode): number {
    switch (code) {
        case 'AI_AUTH_ERROR':
            return 401;
        case 'AI_PERMISSION_DENIED':
            return 403;
        case 'AI_NOT_FOUND':
            return 404;
        case 'AI_QUOTA_EXCEEDED':
            return 429;
        case 'AI_TIMEOUT_ERROR':
            return 504;
        case 'AI_CONNECTION_FAILED':
        case 'AI_SERVICE_UNAVAILABLE':
            return 503;
        case 'AI_RESPONSE_ERROR':
            return 502;
        case 'AI_UNKNOWN_ERROR':
        default:
            return 500;
    }
}

function inferRetryAfterSeconds(message: string, code: AIErrorCode): number | undefined {
    if (code !== 'AI_QUOTA_EXCEEDED') {
        return undefined;
    }

    const match = message.match(/retry[\s-_]*after[:=\s]+(\d+)/i);
    if (match && match[1]) {
        const seconds = Number.parseInt(match[1], 10);
        if (Number.isFinite(seconds) && seconds > 0) {
            return seconds;
        }
    }

    return 60;
}

export function normalizeAIError(error: unknown): NormalizedAIError {
    const message = extractMessage(error);
    const code = inferAIErrorCode(message);
    const status = statusFromCode(code);
    const retryAfterSeconds = inferRetryAfterSeconds(message, code);

    return {
        code,
        message,
        status,
        retryAfterSeconds,
    };
}

