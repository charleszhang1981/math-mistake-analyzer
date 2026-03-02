import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "@/lib/constants/pagination";
import { buildErrorItemWhereClause } from "@/lib/error-item-filters";
import { createSignedObjectUrl } from "@/lib/supabase-storage";

const logger = createLogger("api:error-items:list");

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const includeSignedImage = searchParams.get("includeSignedImage") === "1";

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(MIN_PAGE_SIZE, parseInt(searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE), 10))
    );

    try {
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

        const ids = (searchParams.get("ids") || "")
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id.length > 0);

        const whereClause = buildErrorItemWhereClause({
            userId: user.id,
            subjectId: searchParams.get("subjectId"),
            query: searchParams.get("query"),
            mastery: searchParams.get("mastery"),
            timeRange: searchParams.get("timeRange"),
            tag: searchParams.get("tag"),
            gradeSemester: searchParams.get("gradeSemester"),
            paperLevel: searchParams.get("paperLevel"),
            ids,
        });

        const total = await prisma.errorItem.count({
            where: whereClause,
        });

        const errorItems = await prisma.errorItem.findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
            include: {
                subject: true,
                tags: true,
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });

        const items = includeSignedImage
            ? await Promise.all(
                errorItems.map(async (item) => {
                    const imageKeyForDisplay =
                        item.cropImageKey ||
                        item.rawImageKey ||
                        (typeof item.originalImageUrl === "string" && item.originalImageUrl.startsWith("storage:")
                            ? item.originalImageUrl.slice("storage:".length)
                            : null);

                    if (!imageKeyForDisplay) {
                        return item;
                    }

                    try {
                        const signedUrl = await createSignedObjectUrl({
                            key: imageKeyForDisplay,
                            expiresIn: 1800,
                        });
                        return {
                            ...item,
                            originalImageUrl: signedUrl,
                        };
                    } catch (signError) {
                        logger.warn(
                            { errorItemId: item.id, signError, imageKeyForDisplay },
                            "Failed to sign image URL in list route, fallback to stored originalImageUrl"
                        );
                        return item;
                    }
                })
            )
            : errorItems;

        return NextResponse.json({
            items,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        });
    } catch (error) {
        logger.error({ error }, "Error fetching error items list");
        return internalError("Failed to fetch error items");
    }
}
