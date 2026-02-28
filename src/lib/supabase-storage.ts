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

function retryDelayMs(attempt: number): number {
    return BASE_RETRY_DELAY_MS * (attempt + 1);
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
}): Promise<string> {
    const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();
    const encodedKey = encodeStorageKey(params.key);
    const expiresIn = params.expiresIn ?? 1800;
    let bucketEnsured = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        let res: Response;
        try {
            res = await fetch(
                `${supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedKey}`,
                {
                    method: 'POST',
                    headers: {
                        apikey: serviceRoleKey,
                        Authorization: `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ expiresIn }),
                }
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const canRetry = attempt < MAX_RETRIES;
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

            if (signedPath.startsWith('http://') || signedPath.startsWith('https://')) {
                return signedPath;
            }

            return `${supabaseUrl}${signedPath}`;
        }

        const message = await parseSupabaseError(res);
        if (!bucketEnsured && isBucketNotFound(res.status, message)) {
            await ensurePrivateBucketExists();
            bucketEnsured = true;
            continue;
        }

        const retryable = shouldRetrySupabase(res.status, message);
        const canRetry = retryable && attempt < MAX_RETRIES;
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
