import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { badRequest, createErrorResponse, ErrorCode, unauthorized } from '@/lib/api-errors';
import { createLogger } from '@/lib/logger';
import { uploadPrivateObject, createSignedObjectUrl } from '@/lib/supabase-storage';

const logger = createLogger('api:images:upload');

const ALLOWED_KINDS = new Set(['raw', 'crop', 'answer']);

function sanitizeSessionKeyPart(raw: string): string {
    const normalized = raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (!normalized) return 'user';
    return normalized.slice(0, 64);
}

function inferExtension(contentType: string): string {
    switch (contentType) {
        case 'image/jpeg':
            return 'jpg';
        case 'image/png':
            return 'png';
        case 'image/webp':
            return 'webp';
        default:
            return 'bin';
    }
}

export async function POST(req: Request) {
    try {
        let session = null;
        try {
            session = await getServerSession(authOptions);
        } catch (error) {
            logger.warn(
                { error: error instanceof Error ? error.message : String(error) },
                'Session lookup failed for image upload; continuing without session'
            );
        }

        let userIdForStorage: string | null = null;

        if (session?.user?.email) {
            userIdForStorage = `mail_${sanitizeSessionKeyPart(session.user.email)}`;
            try {
                const user = await prisma.user.findUnique({
                    where: { email: session.user.email },
                    select: { id: true },
                });
                if (user?.id) {
                    userIdForStorage = user.id;
                }
            } catch (error) {
                logger.warn(
                    { error: error instanceof Error ? error.message : String(error), email: session.user.email },
                    'User lookup failed for image upload; using session fallback key'
                );
            }
        }

        if (!userIdForStorage) {
            try {
                const fallbackUser = await prisma.user.findFirst({
                    select: { id: true },
                });
                if (fallbackUser?.id) {
                    userIdForStorage = fallbackUser.id;
                }
            } catch (error) {
                logger.warn(
                    { error: error instanceof Error ? error.message : String(error) },
                    'Fallback user lookup failed for image upload'
                );
            }
        }

        if (!userIdForStorage) {
            return unauthorized('No user found in DB');
        }

        const formData = await req.formData();
        const file = formData.get('file');
        const kind = String(formData.get('kind') || 'raw').toLowerCase();

        if (!(file instanceof File)) {
            return badRequest('Missing file');
        }

        if (!ALLOWED_KINDS.has(kind)) {
            return badRequest('Invalid upload kind');
        }

        const contentType = file.type || 'application/octet-stream';
        const extension = inferExtension(contentType);
        const key = `${kind}/${userIdForStorage}/${crypto.randomUUID()}.${extension}`;
        const body = new Uint8Array(await file.arrayBuffer());

        await uploadPrivateObject({
            key,
            body,
            contentType,
        });

        let signedUrl: string | null = null;
        try {
            signedUrl = await createSignedObjectUrl({
                key,
                expiresIn: 1800,
            });
        } catch (error) {
            logger.warn(
                { key, error: error instanceof Error ? error.message : String(error) },
                'Uploaded image but failed to create signed URL'
            );
        }

        return NextResponse.json({
            key,
            signedUrl,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Failed to upload image');
        const responseMessage = process.env.NODE_ENV === 'development' ? message : 'Failed to upload image';
        return createErrorResponse(responseMessage, 500, ErrorCode.INTERNAL_ERROR);
    }
}
