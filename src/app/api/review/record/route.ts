import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { badRequest, forbidden, internalError, notFound, unauthorized } from "@/lib/api-errors";
import { getNextReviewAt, getReviewIntervalDays } from "@/lib/review-scheduler";

const logger = createLogger("api:review:record");

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
            logger.debug("No session or user found, attempting fallback to first user");
            user = await prisma.user.findFirst();
        }

        if (!user) {
            return unauthorized("No user found in DB");
        }

        const body = await req.json();
        const { errorItemId, isCorrect, reviewNote } = body;

        if (!errorItemId || typeof errorItemId !== "string") {
            return badRequest("errorItemId is required");
        }

        if (typeof isCorrect !== "boolean") {
            return badRequest("isCorrect must be boolean");
        }

        const item = await prisma.errorItem.findUnique({
            where: { id: errorItemId },
            select: { id: true, userId: true },
        });

        if (!item) {
            return notFound("Item not found");
        }

        if (item.userId !== user.id) {
            return forbidden("Not authorized to review this item");
        }

        const trimmedReviewNote = typeof reviewNote === "string" ? reviewNote.trim() : null;
        const now = new Date();
        const nextDueAt = getNextReviewAt(now, isCorrect);
        const intervalDays = getReviewIntervalDays(isCorrect);

        const result = await prisma.$transaction(async (tx) => {
            const pending = await tx.reviewSchedule.findFirst({
                where: {
                    errorItemId,
                    completedAt: null,
                },
                orderBy: {
                    createdAt: "desc",
                },
            });

            let completedRecordId: string;
            if (pending) {
                const completed = await tx.reviewSchedule.update({
                    where: { id: pending.id },
                    data: {
                        completedAt: now,
                        isCorrect,
                        reviewNote: trimmedReviewNote || null,
                    },
                });
                completedRecordId = completed.id;
            } else {
                const completed = await tx.reviewSchedule.create({
                    data: {
                        errorItemId,
                        scheduledFor: now,
                        completedAt: now,
                        isCorrect,
                        reviewNote: trimmedReviewNote || null,
                    },
                });
                completedRecordId = completed.id;
            }

            const nextSchedule = await tx.reviewSchedule.create({
                data: {
                    errorItemId,
                    scheduledFor: nextDueAt,
                },
            });

            return {
                completedRecordId,
                nextScheduleId: nextSchedule.id,
            };
        });

        return NextResponse.json({
            errorItemId,
            isCorrect,
            intervalDays,
            nextDueAt: nextDueAt.toISOString(),
            completedRecordId: result.completedRecordId,
            nextScheduleId: result.nextScheduleId,
        });
    } catch (error) {
        logger.error({ error }, "Error saving review result");
        return internalError("Failed to save review result");
    }
}
