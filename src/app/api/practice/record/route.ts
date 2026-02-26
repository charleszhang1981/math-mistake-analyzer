import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:practice:record');
const MATH_SUBJECT = "数学";

function isMathSubject(input: unknown): boolean {
    if (typeof input !== "string") return false;
    const normalized = input.trim().toLowerCase();
    return normalized === "math" || normalized === "数学";
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
        return unauthorized();
    }

    try {
        const { subject, difficulty, isCorrect } = await req.json();
        if (subject !== undefined && !isMathSubject(subject)) {
            return badRequest("Subject is locked to Math in MVP");
        }

        // @ts-ignore
        const userId = session.user.id;

        const record = await prisma.practiceRecord.create({
            data: {
                userId,
                subject: MATH_SUBJECT,
                difficulty,
                isCorrect,
            },
        });

        return NextResponse.json(record);
    } catch (error) {
        logger.error({ error }, 'Error saving practice record');
        return internalError("Failed to save record");
    }
}
