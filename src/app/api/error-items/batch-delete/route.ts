import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { unauthorized, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { buildErrorItemWhereClause } from "@/lib/error-item-filters";

const logger = createLogger("api:error-items:batch-delete");

interface BatchDeleteFilters {
    subjectId?: string;
    query?: string;
    mastery?: string;
    timeRange?: string;
    tag?: string;
    gradeSemester?: string;
    paperLevel?: string;
}

interface BatchDeleteBody {
    ids?: string[];
    filters?: BatchDeleteFilters;
}

export async function POST(req: Request) {
    logger.info("POST /api/error-items/batch-delete called");

    const session = await getServerSession(authOptions);

    try {
        const body = (await req.json()) as BatchDeleteBody;
        const ids = Array.isArray(body.ids)
            ? body.ids.map((id) => id.trim()).filter((id) => id.length > 0)
            : [];

        let user;
        if (session?.user?.email) {
            user = await prisma.user.findUnique({
                where: { email: session.user.email },
            });
        }

        if (!user) {
            logger.debug("No session or user found, attempting fallback to first user");
            user = await prisma.user.findFirst();
        }

        if (!user) {
            return unauthorized("No user found in DB");
        }

        if (ids.length === 0 && !body.filters) {
            return badRequest("Provide either ids or filters for batch delete");
        }

        if (ids.length > 0) {
            const itemsToDelete = await prisma.errorItem.findMany({
                where: {
                    id: { in: ids },
                },
                select: {
                    id: true,
                    userId: true,
                },
            });

            const ownedIds = itemsToDelete
                .filter((item) => item.userId === user.id)
                .map((item) => item.id);

            const failed = ids.filter((id) => !ownedIds.includes(id));

            const result = ownedIds.length > 0
                ? await prisma.errorItem.deleteMany({ where: { id: { in: ownedIds } } })
                : { count: 0 };

            logger.info({ requested: ids.length, deleted: result.count, failed: failed.length }, "Batch delete by ids completed");
            return NextResponse.json({
                deleted: result.count,
                failed,
                scope: "selected",
            });
        }

        const filters = body.filters!;
        const whereClause = buildErrorItemWhereClause({
            userId: user.id,
            subjectId: filters.subjectId,
            query: filters.query,
            mastery: filters.mastery,
            timeRange: filters.timeRange,
            tag: filters.tag,
            gradeSemester: filters.gradeSemester,
            paperLevel: filters.paperLevel,
        });

        const result = await prisma.errorItem.deleteMany({
            where: whereClause,
        });

        logger.info({ deleted: result.count, userId: user.id }, "Batch delete by filters completed");
        return NextResponse.json({
            deleted: result.count,
            failed: [],
            scope: "results",
        });
    } catch (error) {
        logger.error({ error }, "Error in batch delete");
        return internalError("Failed to delete items");
    }
}
