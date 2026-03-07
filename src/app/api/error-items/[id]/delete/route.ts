import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, forbidden, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { extractStorageKeyFromImageRef } from "@/lib/storage-key";
import { deletePrivateObjects } from "@/lib/supabase-storage";

const logger = createLogger('api:error-items:delete');

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    try {
        let user;
        if (session?.user?.email) {
            user = await prisma.user.findUnique({
                where: { email: session.user.email },
            });
        }

        if (!user) {
            logger.debug('No session or user found, attempting fallback to first user');
            user = await prisma.user.findFirst();
        }

        if (!user) {
            return unauthorized("No user found in DB");
        }

        // Verify ownership before deletion
        const errorItem = await prisma.errorItem.findUnique({
            where: { id: id },
        });

        if (!errorItem) {
            return notFound("Item not found");
        }

        if (errorItem.userId !== user.id) {
            return forbidden("Not authorized to delete this item");
        }

        const storageKeys = Array.from(
            new Set(
                [
                    errorItem.cropImageKey,
                    errorItem.rawImageKey,
                    extractStorageKeyFromImageRef(errorItem.originalImageUrl),
                ].filter((key): key is string => typeof key === "string" && key.trim().length > 0)
            )
        );

        if (storageKeys.length > 0) {
            await deletePrivateObjects({ keys: storageKeys });
        }

        await prisma.errorItem.delete({
            where: { id: id },
        });

        return NextResponse.json({ message: "Deleted successfully" });
    } catch (error) {
        logger.error({ error }, 'Error deleting item');
        return internalError("Failed to delete error item");
    }
}
