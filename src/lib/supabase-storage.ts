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

async function parseSupabaseError(res: Response): Promise<string> {
    try {
        const body = (await res.json()) as SupabaseErrorBody;
        return body.message || body.error || `${res.status} ${res.statusText}`;
    } catch {
        return `${res.status} ${res.statusText}`;
    }
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

    const res = await fetch(
        `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedKey}`,
        {
            method: 'POST',
            headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                'Content-Type': params.contentType,
                'x-upsert': upsert,
            },
            body: params.body,
        }
    );

    if (!res.ok) {
        const message = await parseSupabaseError(res);
        logger.error({ key: params.key, status: res.status, message }, 'Storage upload failed');
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

    const res = await fetch(
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

    if (!res.ok) {
        const message = await parseSupabaseError(res);
        logger.error({ key: params.key, status: res.status, message }, 'Create signed URL failed');
        throw new Error(`SUPABASE_STORAGE_SIGN_FAILED: ${message}`);
    }

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

