import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { badRequest, internalError, unauthorized } from '@/lib/api-errors';
import { createLogger } from '@/lib/logger';
import { uploadPrivateObject, createSignedObjectUrl } from '@/lib/supabase-storage';

const logger = createLogger('api:images:upload');

const ALLOWED_KINDS = new Set(['raw', 'crop', 'answer']);

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
    const session = await getServerSession(authOptions);

    try {
        let user;
        if (session?.user?.email) {
            user = await prisma.user.findUnique({
                where: { email: session.user.email },
            });
        }

        if (!user) {
            user = await prisma.user.findFirst();
        }

        if (!user) {
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
        const key = `${kind}/${user.id}/${crypto.randomUUID()}.${extension}`;
        const body = new Uint8Array(await file.arrayBuffer());

        await uploadPrivateObject({
            key,
            body,
            contentType,
        });

        const signedUrl = await createSignedObjectUrl({
            key,
            expiresIn: 1800,
        });

        return NextResponse.json({
            key,
            signedUrl,
        });
    } catch (error) {
        logger.error({ error }, 'Failed to upload image');
        return internalError('Failed to upload image');
    }
}

