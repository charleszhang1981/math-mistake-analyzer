import { NextResponse } from "next/server";
import { getAIService } from "@/lib/ai";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { calculateGradeNumber, inferSubjectFromName } from "@/lib/knowledge-tags";
import { prisma } from "@/lib/prisma";
import { badRequest, createErrorResponse, ErrorCode } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { normalizeAIError } from "@/lib/ai/error-normalizer";

const logger = createLogger('api:analyze');

export async function POST(req: Request) {
    logger.info('Analyze API called');

    const session = await getServerSession(authOptions);

    // 认证检查
    if (!session) {
        logger.warn('Unauthorized access attempt');
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        let { imageBase64, mimeType, language, subjectId } = body;

        logger.debug({
            imageLength: imageBase64?.length,
            mimeType,
            language,
            subjectId
        }, 'Request received');

        if (!imageBase64) {
            logger.warn('Missing image data');
            return badRequest("Missing image data");
        }

        // Parse Data URL if present
        if (imageBase64.startsWith('data:')) {
            const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
                mimeType = matches[1];
                imageBase64 = matches[2];
                logger.debug({ mimeType, base64Length: imageBase64.length }, 'Parsed Data URL');
            }
        }

        // 先获取用户年级信息，用于动态生成 AI prompt 中的标签列表
        let userGrade: 7 | 8 | 9 | 10 | 11 | 12 | null = null;
        let subjectName: 'math' | 'physics' | 'chemistry' | 'biology' | 'english' | 'chinese' | 'history' | 'geography' | 'politics' | null = null;

        if (session?.user?.email) {
            try {
                // 获取用户信息
                const user = await prisma.user.findUnique({
                    where: { email: session.user.email },
                    select: { educationStage: true, enrollmentYear: true }
                });

                if (user) {
                    userGrade = calculateGradeNumber(user.educationStage, user.enrollmentYear);
                    logger.debug({ userGrade }, 'Calculated user grade');
                }

                // 获取错题本信息以推断学科
                if (subjectId) {
                    const subject = await prisma.subject.findUnique({
                        where: { id: subjectId },
                        select: { name: true }
                    });

                    if (subject) {
                        subjectName = inferSubjectFromName(subject.name);
                        logger.debug({ subjectName, subjectDisplayName: subject.name }, 'Inferred subject');
                    }
                }
            } catch (error) {
                logger.error({ error }, 'Error fetching user/subject info');
                // 继续执行，不传递年级参数（会返回所有年级的标签）
            }
        }


        // 将内部科目名称转换为中文科目名称
        const subjectNameMapping: Record<string, string> = {
            'math': '数学',
            'physics': '物理',
            'chemistry': '化学',
            'biology': '生物',
            'english': '英语',
            'chinese': '语文',
            'history': '历史',
            'geography': '地理',
            'politics': '政治',
        };
        const subjectChinese = subjectName ? subjectNameMapping[subjectName] : null;

        logger.info({ userGrade, subject: subjectChinese }, 'Calling AI service for image analysis');
        const aiService = getAIService();
        const analysisResult = await aiService.analyzeImage(imageBase64, mimeType, language, userGrade, subjectChinese);

        logger.debug({
            knowledgePointsCount: analysisResult.knowledgePoints?.length,
            knowledgePointsType: typeof analysisResult.knowledgePoints,
            isArray: Array.isArray(analysisResult.knowledgePoints)
        }, 'AI returned knowledge points');

        // AI 现在从数据库获取标签列表，返回的标签已经是标准化的，不需要额外处理
        if (!analysisResult.knowledgePoints || analysisResult.knowledgePoints.length === 0) {
            logger.warn('Knowledge points is empty or null');
        }

        logger.info('AI analysis successful');

        return NextResponse.json(analysisResult);
    } catch (error: any) {
        logger.error({
            error: error.message,
            stack: error.stack
        }, 'Analysis error occurred');

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
