import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { internalError, unauthorized } from "@/lib/api-errors";

const logger = createLogger("api:review:list");

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const dueOnly = searchParams.get("dueOnly") !== "false";

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

        const errorItems = await prisma.errorItem.findMany({
            where: {
                userId: user.id,
            },
            orderBy: {
                createdAt: "desc",
            },
            include: {
                tags: true,
                reviewSchedules: {
                    orderBy: {
                        createdAt: "desc",
                    },
                    take: 30,
                },
            },
        });

        const nowMs = Date.now();

        const reviewItems = errorItems
            .map((item) => {
                const pendingSchedule = item.reviewSchedules.find((schedule) => !schedule.completedAt) || null;
                const lastCompleted = item.reviewSchedules.find((schedule) => Boolean(schedule.completedAt)) || null;
                const reviewCount = item.reviewSchedules.reduce((count, schedule) => {
                    return count + (schedule.completedAt ? 1 : 0);
                }, 0);

                const nextDueAt = pendingSchedule?.scheduledFor ?? item.createdAt;
                const isDue = nextDueAt.getTime() <= nowMs;

                return {
                    errorItemId: item.id,
                    questionText: item.questionText || "",
                    analysis: item.analysis || null,
                    tags: item.tags.map((tag) => tag.name),
                    cause: "Uncategorized",
                    nextDueAt: nextDueAt.toISOString(),
                    isDue,
                    lastReviewedAt: lastCompleted?.completedAt?.toISOString() || null,
                    lastReviewCorrect: lastCompleted?.isCorrect ?? null,
                    lastReviewNote: lastCompleted?.reviewNote || null,
                    reviewCount,
                };
            })
            .filter((item) => (dueOnly ? item.isDue : true))
            .sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime());

        return NextResponse.json({
            items: reviewItems,
            total: reviewItems.length,
            dueOnly,
        });
    } catch (error) {
        logger.error({ error }, "Error fetching review list");
        return internalError("Failed to fetch review list");
    }
}
