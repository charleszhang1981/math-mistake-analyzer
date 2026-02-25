import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { badRequest, forbidden, internalError, unauthorized } from '@/lib/api-errors';
import { createLogger } from '@/lib/logger';
import { createSignedObjectUrl } from '@/lib/supabase-storage';

const logger = createLogger('api:images:signed');

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');

    if (!key) {
        return badRequest('Missing key');
    }

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

        // Enforce per-user object path convention: <kind>/<userId>/<file>
        if (!key.includes(`/${user.id}/`)) {
            return forbidden('Not authorized to access this object');
        }

        const signedUrl = await createSignedObjectUrl({
            key,
            expiresIn: 1800,
        });

        return NextResponse.json({ signedUrl });
    } catch (error) {
        logger.error({ error, key }, 'Failed to sign image URL');
        return internalError('Failed to sign image URL');
    }
}

