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

function asPlainObject(value: unknown): Record<string, unknown> | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parseLegacyKnowledgePoints(knowledgePoints: string | null | undefined): string[] {
    if (!knowledgePoints) return [];
    try {
        const parsed = JSON.parse(knowledgePoints);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter((item) => item.length > 0);
    } catch {
        return [];
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return unauthorized();
    }

    try {
        const { errorItemId, language, difficulty } = await req.json();

        const errorItemWithSubject = await prisma.errorItem.findUnique({
            where: { id: errorItemId },
            include: {
                subject: true,
                tags: true,
            },
        });

        if (!errorItemWithSubject) {
            return notFound("Item not found");
        }

        const relationalTagNames = (errorItemWithSubject.tags || [])
            .map((tag) => tag.name.trim())
            .filter((name) => name.length > 0);
        const structured = asPlainObject(errorItemWithSubject.structuredJson);
        const structuredKnowledge = asPlainObject(structured?.knowledge);
        const structuredTagCandidates = Array.isArray(structuredKnowledge?.tags)
            ? structuredKnowledge.tags
            : [];
        const structuredTagNames = structuredTagCandidates
            .map((item) => asNonEmptyString(asPlainObject(item)?.name) || "")
            .filter((name) => name.length > 0);
        const legacyTagNames = parseLegacyKnowledgePoints(errorItemWithSubject.knowledgePoints);
        const tags = Array.from(new Set([...relationalTagNames, ...structuredTagNames, ...legacyTagNames]));

        const structuredMistake = asPlainObject(structured?.mistake);
        const structuredRootCause = asPlainObject(structured?.rootCause);
        const diagnosis = asPlainObject(errorItemWithSubject.diagnosisJson);
        const mistakeWhyWrong = asNonEmptyString(structuredMistake?.whyWrong) || null;
        const confirmedRootCause =
            asNonEmptyString(structuredRootCause?.confirmedCause)
            || asNonEmptyString(diagnosis?.finalCause)
            || null;

        const aiService = getAIService();
        const similarQuestion = await aiService.generateSimilarQuestion(
            errorItemWithSubject.questionText || "",
            tags,
            language,
            difficulty || 'medium',
            {
                gradeSemester: errorItemWithSubject.gradeSemester || null,
                mistakeWhyWrong,
                confirmedRootCause,
            }
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
