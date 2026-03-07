import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { calculateGrade } from "@/lib/grade-calculator";
import { unauthorized, internalError, badRequest } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { findParentTagIdForGrade } from "@/lib/tag-recognition";
import { buildStructuredQuestionJson, normalizeStructuredQuestionJson } from "@/lib/ai/structured-json";
import { generateNextQuestionNo } from "@/lib/question-no";

const logger = createLogger('api:error-items');
const MATH_NOTEBOOK_NAME = "Math";
const MAX_QUESTION_NO_RETRIES = 5;

async function ensureMathNotebook(userId: string) {
    const existingMath = await prisma.subject.findFirst({
        where: {
            userId,
            OR: [
                { name: MATH_NOTEBOOK_NAME },
                { name: "数学" },
                { name: "math" },
            ],
        },
    });

    if (existingMath) {
        if (existingMath.name !== MATH_NOTEBOOK_NAME) {
            return prisma.subject.update({
                where: { id: existingMath.id },
                data: { name: MATH_NOTEBOOK_NAME },
            });
        }
        return existingMath;
    }

    return prisma.subject.create({
        data: {
            name: MATH_NOTEBOOK_NAME,
            userId,
        },
    });
}

export async function POST(req: Request) {
    logger.info('POST /api/error-items called');

    const session = await getServerSession(authOptions);

    try {
        const body = await req.json();
        const {
            questionText,
            answerText,
            analysis,
            solutionFinalAnswer,
            solutionSteps,
            mistakeStudentSteps,
            mistakeWrongStepIndex,
            mistakeWhyWrong,
            mistakeFixSuggestion,
            knowledgePoints,
            originalImageUrl,
            rawImageKey,
            cropImageKey,
            structuredJson,
            gradeSemester,
            paperLevel,
        } = body;

        // 记录请求参数（不记录完整图片数据）
        logger.debug({
            hasQuestionText: !!questionText,
            questionTextLength: questionText?.length || 0,
            hasAnswerText: !!answerText,
            hasAnalysis: !!analysis,
            knowledgePointsCount: Array.isArray(knowledgePoints) ? knowledgePoints.length : 0,
            hasImage: !!originalImageUrl,
            imageSize: originalImageUrl?.length || 0,
            rawImageKey,
            cropImageKey,
            gradeSemester,
            paperLevel,
        }, 'Request parameters received');

        // 查找用户
        let user;
        if (session?.user?.email) {
            user = await prisma.user.findUnique({
                where: { email: session.user.email },
            });
            logger.debug({ userId: user?.id, email: session.user.email }, 'User lookup result');
        } else {
            logger.warn('No session email found');
        }

        if (!user) {
            logger.warn({ sessionEmail: session?.user?.email }, 'User not found in DB');
            return unauthorized("No user found in DB");
        }

        if (!originalImageUrl && !rawImageKey) {
            return badRequest("Missing image reference");
        }

        // ========== 去重检查：2秒内同一用户提交相同题目视为重复 ==========
        const DEDUP_WINDOW_MS = 2000; // 2秒去重窗口
        const questionTextPrefix = questionText?.substring(0, 100) || ''; // 取前100字符比较

        if (questionTextPrefix) {
            const recentDuplicate = await prisma.errorItem.findFirst({
                where: {
                    userId: user.id,
                    questionText: {
                        startsWith: questionTextPrefix,
                    },
                    createdAt: {
                        gte: new Date(Date.now() - DEDUP_WINDOW_MS),
                    },
                },
                include: {
                    tags: true,
                },
            });

            if (recentDuplicate) {
                logger.info({
                    existingId: recentDuplicate.id,
                    userId: user.id,
                    timeDiff: Date.now() - recentDuplicate.createdAt.getTime()
                }, 'Duplicate submission detected within dedup window, returning existing record');

                return NextResponse.json({
                    ...recentDuplicate,
                    duplicate: true, // 标记为重复提交
                }, { status: 200 }); // 返回 200 而非 201
            }
        }

        // 计算年级
        let finalGradeSemester = gradeSemester;
        if (!finalGradeSemester && user.educationStage && user.enrollmentYear) {
            finalGradeSemester = calculateGrade(user.educationStage, user.enrollmentYear);
            logger.debug({ finalGradeSemester, educationStage: user.educationStage, enrollmentYear: user.enrollmentYear }, 'Grade calculated');
        }

        // 处理知识点标签
        const tagNames: string[] = Array.isArray(knowledgePoints) ? knowledgePoints : [];
        const tagConnections: { id: string }[] = [];

        // MVP: 学科锁定为 Math
        const mathNotebook = await ensureMathNotebook(user.id);
        const subjectKey = 'math';
        logger.debug({ subjectId: mathNotebook.id, subjectName: mathNotebook.name, subjectKey }, 'Subject locked to math');

        // 处理每个标签
        for (const tagName of tagNames) {
            try {
                let tag = await prisma.knowledgeTag.findFirst({
                    where: {
                        name: tagName,
                        OR: [
                            { isSystem: true },
                            { userId: user.id },
                        ],
                    },
                });

                if (!tag) {
                    const parentId = await findParentTagIdForGrade(finalGradeSemester, subjectKey);
                    logger.debug({ tagName, parentId, subjectKey }, 'Creating new custom tag');

                    tag = await prisma.knowledgeTag.create({
                        data: {
                            name: tagName,
                            subject: subjectKey,
                            isSystem: false,
                            userId: user.id,
                            parentId: parentId,
                        },
                    });
                    logger.debug({ tagId: tag.id, tagName }, 'Custom tag created');
                } else {
                    logger.debug({ tagId: tag.id, tagName, isSystem: tag.isSystem }, 'Existing tag found');
                }

                tagConnections.push({ id: tag.id });
            } catch (tagError) {
                logger.error({ tagName, error: tagError }, 'Error processing tag');
                throw tagError;
            }
        }

        logger.info({ tagNames, tagConnectionsCount: tagConnections.length }, 'Creating ErrorItem with tags');
        const normalizedStructuredJson = normalizeStructuredQuestionJson(structuredJson)
            ?? buildStructuredQuestionJson({
                questionText,
                answerText,
                analysis,
                solutionFinalAnswer,
                solutionSteps,
                mistakeStudentSteps,
                mistakeWrongStepIndex,
                mistakeWhyWrong,
                mistakeFixSuggestion,
            });

        // 创建错题记录
        try {
            let errorItem: Prisma.ErrorItemGetPayload<{ include: { tags: true } }> | null = null;
            for (let attempt = 1; attempt <= MAX_QUESTION_NO_RETRIES; attempt++) {
                const questionNo = await generateNextQuestionNo(prisma, user.id);
                try {
                    errorItem = await prisma.errorItem.create({
                        data: {
                            userId: user.id,
                            subjectId: mathNotebook.id,
                            questionNo,
                            originalImageUrl: originalImageUrl || `storage:${rawImageKey}`,
                            rawImageKey: rawImageKey || undefined,
                            cropImageKey: cropImageKey || undefined,
                            questionText,
                            answerText,
                            analysis,
                            knowledgePoints: JSON.stringify(tagNames),
                            structuredJson: normalizedStructuredJson ?? undefined,
                            gradeSemester: finalGradeSemester,
                            paperLevel: paperLevel,
                            masteryLevel: 0,
                            tags: {
                                connect: tagConnections,
                            },
                            reviewSchedules: {
                                create: {
                                    scheduledFor: new Date(),
                                },
                            },
                        },
                        include: {
                            tags: true,
                        },
                    });
                    break;
                } catch (createError) {
                    const isQuestionNoConflict =
                        createError instanceof Prisma.PrismaClientKnownRequestError
                        && createError.code === "P2002"
                        && Array.isArray(createError.meta?.target)
                        && createError.meta.target.includes("userId")
                        && createError.meta.target.includes("questionNo");

                    if (!isQuestionNoConflict || attempt === MAX_QUESTION_NO_RETRIES) {
                        throw createError;
                    }

                    logger.warn(
                        { userId: user.id, attempt },
                        "Question number conflict detected, retrying"
                    );
                }
            }

            if (!errorItem) {
                throw new Error("Failed to allocate question number");
            }

            logger.info({ errorItemId: errorItem.id, tagsCount: errorItem.tags?.length || 0 }, 'ErrorItem created successfully');
            return NextResponse.json(errorItem, { status: 201 });
        } catch (dbError) {
            logger.error({
                error: dbError,
                userId: user.id,
                subjectId: mathNotebook.id,
                tagConnectionsCount: tagConnections.length
            }, 'Database error creating ErrorItem');
            throw dbError;
        }
    } catch (error) {
        logger.error({
            error,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined
        }, 'Error saving item');
        return internalError("Failed to save error item");
    }
}
