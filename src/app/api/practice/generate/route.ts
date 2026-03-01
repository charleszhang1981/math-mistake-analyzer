import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { getAIService } from "@/lib/ai";
import { unauthorized, notFound, createErrorResponse, ErrorCode } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { normalizeAIError } from "@/lib/ai/error-normalizer";

const logger = createLogger('api:practice:generate');
const MATH_SUBJECT = "数学";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return unauthorized();
    }

    try {
        const { errorItemId, language, difficulty } = await req.json();

        const errorItemWithSubject = await prisma.errorItem.findUnique({
            where: { id: errorItemId },
            include: { subject: true }
        });

        if (!errorItemWithSubject) {
            return notFound("Item not found");
        }

        let tags: string[] = [];
        try {
            const parsed = JSON.parse(errorItemWithSubject.knowledgePoints || "[]");
            tags = Array.isArray(parsed) ? parsed : [];
        } catch {
            tags = [];
        }

        const aiService = getAIService();
        const similarQuestion = await aiService.generateSimilarQuestion(
            errorItemWithSubject.questionText || "",
            tags,
            language,
            difficulty || 'medium'
        );
        // MVP hard constraint: subject is locked to math.
        similarQuestion.subject = MATH_SUBJECT;

        return NextResponse.json(similarQuestion);
    } catch (error) {
        logger.error({ error }, 'Error generating practice');
        const normalized = normalizeAIError(error);
        const details: Record<string, unknown> = {
            rawMessage: normalized.message,
        };

        if (normalized.retryAfterSeconds) {
            details.retryAfterSeconds = normalized.retryAfterSeconds;
        }

        return createErrorResponse(normalized.code, normalized.status, ErrorCode.AI_ERROR, details);
    }
}
