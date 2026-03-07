import { createLogger } from './logger';

const logger = createLogger('supabase:storage');

function ensureEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env: ${name}`);
    }
    return value;
}

function encodeStorageKey(key: string): string {
    return key.split('/').map(encodeURIComponent).join('/');
}

function getStorageConfig() {
    return {
        supabaseUrl: ensureEnv('SUPABASE_URL').replace(/\/+$/, ''),
        serviceRoleKey: ensureEnv('SUPABASE_SERVICE_ROLE_KEY'),
        bucket: process.env.SUPABASE_STORAGE_BUCKET || 'wrongbook',
    };
}

interface SupabaseErrorBody {
    error?: string;
    message?: string;
    statusCode?: number;
}

const MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 250;
const DEFAULT_SIGNED_URL_TIMEOUT_MS = 2500;
const DEFAULT_SIGNED_URL_CACHE_TTL_MS = 10 * 60 * 1000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetrySupabase(status: number, message: string): boolean {
    if (status === 408 || status === 429 || status >= 500) {
        return true;
    }

    if (status === 400 || status === 404) {
        const normalized = message.toLowerCase();
        return normalized.includes('not found');
    }

    return false;
}

function isBucketNotFound(status: number, message: string): boolean {
    if (status !== 400 && status !== 404) return false;
    const normalized = message.toLowerCase();
    return normalized.includes('bucket') && normalized.includes('not found');
}

function isObjectNotFound(status: number, message: string): boolean {
    if (status !== 400 && status !== 404) return false;
    if (isBucketNotFound(status, message)) return false;

    const normalized = message.toLowerCase();
    return normalized.includes('not found') || normalized.includes('no such object');
}

function retryDelayMs(attempt: number): number {
    return BASE_RETRY_DELAY_MS * (attempt + 1);
}

function getSignedUrlCacheKey(bucket: string, key: string, expiresIn: number): string {
    return `${bucket}:${key}:${expiresIn}`;
}

function getCachedSignedUrl(cacheKey: string): string | null {
    const now = Date.now();
    const cached = signedUrlCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= now) {
        signedUrlCache.delete(cacheKey);
        return null;
    }
    return cached.url;
}

function setCachedSignedUrl(cacheKey: string, url: string, ttlMs: number): void {
    const now = Date.now();
    signedUrlCache.set(cacheKey, {
        url,
        expiresAt: now + ttlMs,
    });

    // Opportunistic cleanup to prevent unbounded growth.
    if (signedUrlCache.size > 2000) {
        for (const [key, entry] of signedUrlCache.entries()) {
            if (entry.expiresAt <= now) {
                signedUrlCache.delete(key);
            }
        }
    }
}

function deleteCachedSignedUrls(bucket: string, keys: string[]): void {
    if (keys.length === 0) return;

    for (const cacheKey of signedUrlCache.keys()) {
        const matches = keys.some((key) => cacheKey.startsWith(`${bucket}:${key}:`));
        if (matches) {
            signedUrlCache.delete(cacheKey);
        }
    }
}

async function fetchWithTimeout(
    input: string,
    init: RequestInit,
    timeoutMs: number
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

function normalizeSignedUrl(supabaseUrl: string, signedPath: string): string {
    if (signedPath.startsWith('http://') || signedPath.startsWith('https://')) {
        return signedPath;
    }

    if (signedPath.startsWith('/storage/v1/')) {
        return `${supabaseUrl}${signedPath}`;
    }

    if (signedPath.startsWith('/object/')) {
        return `${supabaseUrl}/storage/v1${signedPath}`;
    }

    const normalizedPath = signedPath.replace(/^\/+/, '');
    if (normalizedPath.startsWith('storage/v1/')) {
        return `${supabaseUrl}/${normalizedPath}`;
    }

    if (normalizedPath.startsWith('object/')) {
        return `${supabaseUrl}/storage/v1/${normalizedPath}`;
    }

    return `${supabaseUrl}/${normalizedPath}`;
}

async function parseSupabaseError(res: Response): Promise<string> {
    try {
        const body = (await res.json()) as SupabaseErrorBody;
        return body.message || body.error || `${res.status} ${res.statusText}`;
    } catch {
        return `${res.status} ${res.statusText}`;
    }
}

async function ensurePrivateBucketExists(): Promise<void> {
    const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();
    const bucketPath = encodeURIComponent(bucket);

    const checkRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucketPath}`, {
        method: 'GET',
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
        },
    });

    if (checkRes.ok) {
        return;
    }

    const checkMessage = await parseSupabaseError(checkRes);
    if (!isBucketNotFound(checkRes.status, checkMessage)) {
        throw new Error(`SUPABASE_STORAGE_BUCKET_CHECK_FAILED: ${checkMessage}`);
    }

    const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
        method: 'POST',
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            id: bucket,
            name: bucket,
            public: false,
        }),
    });

    if (createRes.ok || createRes.status === 409) {
        logger.info({ bucket }, 'Created missing private storage bucket automatically');
        return;
    }

    const createMessage = await parseSupabaseError(createRes);
    throw new Error(`SUPABASE_STORAGE_BUCKET_CREATE_FAILED: ${createMessage}`);
}

export async function uploadPrivateObject(params: {
    key: string;
    body: Uint8Array;
    contentType: string;
    upsert?: boolean;
}): Promise<void> {
    const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();
    const encodedKey = encodeStorageKey(params.key);
    const upsert = params.upsert ? 'true' : 'false';
    const uploadBytes = new Uint8Array(params.body);
    const uploadBody = new Blob([uploadBytes], { type: params.contentType });
    let bucketEnsured = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        let res: Response;
        try {
            res = await fetch(
                `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedKey}`,
                {
                    method: 'POST',
                    headers: {
                        apikey: serviceRoleKey,
                        Authorization: `Bearer ${serviceRoleKey}`,
                        'Content-Type': params.contentType,
                        'x-upsert': upsert,
                    },
                    body: uploadBody,
                }
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const canRetry = attempt < MAX_RETRIES;
            if (canRetry) {
                const delayMs = retryDelayMs(attempt);
                logger.warn(
                    { key: params.key, message, attempt: attempt + 1, delayMs },
                    'Storage upload failed due to network error; retrying'
                );
                await wait(delayMs);
                continue;
            }
            throw new Error(`SUPABASE_STORAGE_UPLOAD_FAILED: NETWORK_ERROR: ${message}`);
        }

        if (res.ok) {
            return;
        }

        const message = await parseSupabaseError(res);
        if (!bucketEnsured && isBucketNotFound(res.status, message)) {
            try {
                await ensurePrivateBucketExists();
                bucketEnsured = true;
                continue;
            } catch (error) {
                const bucketErrorMessage = error instanceof Error ? error.message : String(error);
                logger.error(
                    { key: params.key, status: res.status, message, bucketErrorMessage, attempt: attempt + 1 },
                    'Storage upload failed and automatic bucket ensure failed'
                );
                throw new Error(`SUPABASE_STORAGE_UPLOAD_FAILED: ${bucketErrorMessage}`);
            }
        }

        const retryable = shouldRetrySupabase(res.status, message);
        const canRetry = retryable && attempt < MAX_RETRIES;
        if (canRetry) {
            const delayMs = retryDelayMs(attempt);
            logger.warn(
                { key: params.key, status: res.status, message, attempt: attempt + 1, delayMs },
                'Storage upload failed with retryable status; retrying'
            );
            await wait(delayMs);
            continue;
        }

        logger.error({ key: params.key, status: res.status, message, attempt: attempt + 1 }, 'Storage upload failed');
        throw new Error(`SUPABASE_STORAGE_UPLOAD_FAILED: ${message}`);
    }
}

export async function createSignedObjectUrl(params: {
    key: string;
    expiresIn?: number;
    timeoutMs?: number;
    maxRetries?: number;
    disableCache?: boolean;
    cacheTtlMs?: number;
}): Promise<string> {
    const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();
    const encodedKey = encodeStorageKey(params.key);
    const expiresIn = params.expiresIn ?? 1800;
    const timeoutMs = params.timeoutMs ?? DEFAULT_SIGNED_URL_TIMEOUT_MS;
    const maxRetries = params.maxRetries ?? MAX_RETRIES;
    const disableCache = params.disableCache ?? false;
    const cacheTtlMs = params.cacheTtlMs ?? DEFAULT_SIGNED_URL_CACHE_TTL_MS;
    const cacheKey = getSignedUrlCacheKey(bucket, params.key, expiresIn);
    let bucketEnsured = false;

    if (!disableCache) {
        const cachedUrl = getCachedSignedUrl(cacheKey);
        if (cachedUrl) {
            return cachedUrl;
        }
    }

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        let res: Response;
        try {
            res = await fetchWithTimeout(
                `${supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedKey}`,
                {
                    method: 'POST',
                    headers: {
                        apikey: serviceRoleKey,
                        Authorization: `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ expiresIn }),
                },
                timeoutMs
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const canRetry = attempt < maxRetries;
            if (canRetry) {
                const delayMs = retryDelayMs(attempt);
                logger.warn(
                    { key: params.key, message, attempt: attempt + 1, delayMs },
                    'Create signed URL failed due to network error; retrying'
                );
                await wait(delayMs);
                continue;
            }
            throw new Error(`SUPABASE_STORAGE_SIGN_FAILED: NETWORK_ERROR: ${message}`);
        }

        if (res.ok) {
            const data = (await res.json()) as { signedURL?: string; signedUrl?: string };
            const signedPath = data.signedURL || data.signedUrl;
            if (!signedPath) {
                throw new Error('SUPABASE_STORAGE_SIGN_FAILED: Missing signed URL in response');
            }
            const normalizedUrl = normalizeSignedUrl(supabaseUrl, signedPath);
            if (!disableCache && cacheTtlMs > 0) {
                const ttl = Math.max(5_000, Math.min(cacheTtlMs, expiresIn * 1000 - 30_000));
                setCachedSignedUrl(cacheKey, normalizedUrl, ttl);
            }
            return normalizedUrl;
        }

        const message = await parseSupabaseError(res);
        if (!bucketEnsured && isBucketNotFound(res.status, message)) {
            await ensurePrivateBucketExists();
            bucketEnsured = true;
            continue;
        }

        const retryable = shouldRetrySupabase(res.status, message);
        const canRetry = retryable && attempt < maxRetries;
        if (canRetry) {
            const delayMs = retryDelayMs(attempt);
            logger.warn(
                { key: params.key, status: res.status, message, attempt: attempt + 1, delayMs },
                'Create signed URL failed with retryable status; retrying'
            );
            await wait(delayMs);
            continue;
        }

        logger.error({ key: params.key, status: res.status, message, attempt: attempt + 1 }, 'Create signed URL failed');
        throw new Error(`SUPABASE_STORAGE_SIGN_FAILED: ${message}`);
    }

    throw new Error('SUPABASE_STORAGE_SIGN_FAILED: Unexpected retry loop exit');
}

export async function deletePrivateObjects(params: {
    keys: string[];
}): Promise<void> {
    const normalizedKeys = Array.from(
        new Set(
            params.keys
                .map((key) => key.trim())
                .filter((key) => key.length > 0)
        )
    );

    if (normalizedKeys.length === 0) {
        return;
    }

    const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        let res: Response;
        try {
            res = await fetch(
                `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`,
                {
                    method: 'DELETE',
                    headers: {
                        apikey: serviceRoleKey,
                        Authorization: `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        prefixes: normalizedKeys,
                    }),
                }
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const canRetry = attempt < MAX_RETRIES;
            if (canRetry) {
                const delayMs = retryDelayMs(attempt);
                logger.warn(
                    { keys: normalizedKeys, message, attempt: attempt + 1, delayMs },
                    'Storage delete failed due to network error; retrying'
                );
                await wait(delayMs);
                continue;
            }
            throw new Error(`SUPABASE_STORAGE_DELETE_FAILED: NETWORK_ERROR: ${message}`);
        }

        if (res.ok) {
            deleteCachedSignedUrls(bucket, normalizedKeys);
            return;
        }

        const message = await parseSupabaseError(res);
        if (isObjectNotFound(res.status, message)) {
            deleteCachedSignedUrls(bucket, normalizedKeys);
            logger.info({ keys: normalizedKeys, status: res.status, message }, 'Storage objects already missing; treating delete as success');
            return;
        }

        const retryable = shouldRetrySupabase(res.status, message);
        const canRetry = retryable && attempt < MAX_RETRIES;
        if (canRetry) {
            const delayMs = retryDelayMs(attempt);
            logger.warn(
                { keys: normalizedKeys, status: res.status, message, attempt: attempt + 1, delayMs },
                'Storage delete failed with retryable status; retrying'
            );
            await wait(delayMs);
            continue;
        }

        logger.error({ keys: normalizedKeys, status: res.status, message, attempt: attempt + 1 }, 'Storage delete failed');
        throw new Error(`SUPABASE_STORAGE_DELETE_FAILED: ${message}`);
    }

    throw new Error('SUPABASE_STORAGE_DELETE_FAILED: Unexpected retry loop exit');
}
