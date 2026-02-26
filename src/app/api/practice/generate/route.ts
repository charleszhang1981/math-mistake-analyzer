import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { getAIService } from "@/lib/ai";
import { unauthorized, notFound, createErrorResponse, ErrorCode } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { normalizeAIError } from "@/lib/ai/error-normalizer";
import { buildCheckerJson } from "@/lib/math-checker";
import { extractDiagnosisCause } from "@/lib/review-scheduler";

const logger = createLogger('api:practice:generate');
const MAX_GATING_ATTEMPTS = 3;
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

        const diagnosisCause = extractDiagnosisCause(errorItemWithSubject.diagnosisJson);
        const hasDiagnosisCause =
            diagnosisCause.trim().length > 0 && diagnosisCause !== "Uncategorized";
        const generationTags = hasDiagnosisCause
            ? [...tags, `focus_cause:${diagnosisCause}`]
            : tags;
        const generationSourceQuestion = hasDiagnosisCause
            ? `${errorItemWithSubject.questionText || ""}\n\nFocus mistake cause: ${diagnosisCause}`
            : (errorItemWithSubject.questionText || "");

        const aiService = getAIService();
        let lastGateReason: string | null = null;

        for (let attempt = 1; attempt <= MAX_GATING_ATTEMPTS; attempt++) {
            const similarQuestion = await aiService.generateSimilarQuestion(
                generationSourceQuestion,
                generationTags,
                language,
                difficulty || 'medium'
            );

            // MVP hard constraint: subject is locked to math.
            similarQuestion.subject = MATH_SUBJECT;

            const checker = buildCheckerJson({
                questionText: similarQuestion.questionText,
                answerText: similarQuestion.answerText,
            });

            if (checker.checkable && checker.is_correct === true) {
                return NextResponse.json(similarQuestion);
            }

            lastGateReason = checker.diff
                || (checker.checkable
                    ? "Checker could not verify generated answer correctness."
                    : "Generated question was not checkable.");

            logger.warn(
                {
                    attempt,
                    maxAttempts: MAX_GATING_ATTEMPTS,
                    checkable: checker.checkable,
                    isCorrect: checker.is_correct,
                    diff: checker.diff,
                },
                'Practice question rejected by checker gate'
            );
        }

        return createErrorResponse(
            "PRACTICE_GATING_FAILED",
            422,
            ErrorCode.VALIDATION_ERROR,
            {
                maxAttempts: MAX_GATING_ATTEMPTS,
                reason: lastGateReason,
            }
        );
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
