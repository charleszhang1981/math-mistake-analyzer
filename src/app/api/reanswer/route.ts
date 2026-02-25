import { NextResponse } from "next/server";
import { getAIService } from "@/lib/ai";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { badRequest, createErrorResponse, ErrorCode } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { normalizeAIError } from "@/lib/ai/error-normalizer";

const logger = createLogger('api:reanswer');

export async function POST(req: Request) {
    logger.info('Reanswer API called');

    const session = await getServerSession(authOptions);

    // 认证检查
    if (!session) {
        logger.warn('Unauthorized access attempt');
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { questionText, language = 'zh', subject, imageBase64 } = body;

        logger.debug({
            questionLength: questionText?.length,
            language,
            subject,
            hasImage: !!imageBase64
        }, 'Reanswer request received');

        if (!questionText || questionText.trim().length === 0) {
            logger.warn('Missing question text');
            return badRequest("Missing question text");
        }

        const aiService = getAIService();

        // 根据是否有图片选择不同的重新解题方式
        const result = await aiService.reanswerQuestion(questionText, language, subject, imageBase64);

        logger.info('Reanswer successful');

        return NextResponse.json(result);
    } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack }, 'Reanswer error occurred');

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
