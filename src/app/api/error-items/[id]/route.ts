import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { unauthorized, forbidden, notFound, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { findParentTagIdForGrade } from "@/lib/tag-recognition";
import { createSignedObjectUrl } from "@/lib/supabase-storage";
import { buildStructuredQuestionJson, normalizeStructuredQuestionJson } from "@/lib/ai/structured-json";

const logger = createLogger('api:error-items:id');

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    try {
        let user;
        if (session?.user?.email) {
            user = await prisma.user.findUnique({
                where: { email: session.user.email },
            });
        }

        if (!user) {
            logger.debug('No session or user found, attempting fallback to first user');
            user = await prisma.user.findFirst();
        }

        if (!user) {
            return unauthorized("No user found in DB");
        }

        const errorItem = await prisma.errorItem.findUnique({
            where: {
                id: id,
            },
            include: {
                subject: true,
                tags: true, // include tag relations
            },
        });

        if (!errorItem) {
            return notFound("Item not found");
        }

        // Ensure the user owns this item
        if (errorItem.userId !== user.id) {
            return forbidden("Not authorized to access this item");
        }

        const responseItem = { ...errorItem } as typeof errorItem;
        const imageKeyForDisplay = errorItem.cropImageKey || errorItem.rawImageKey;
        if (imageKeyForDisplay) {
            try {
                responseItem.originalImageUrl = await createSignedObjectUrl({
                    key: imageKeyForDisplay,
                    expiresIn: 1800,
                });
            } catch (signError) {
                logger.warn({ id, signError, imageKeyForDisplay }, 'Failed to sign image URL, fallback to stored originalImageUrl');
            }
        }

        return NextResponse.json(responseItem);
    } catch (error) {
        logger.error({ error }, 'Error fetching item');
        return internalError("Failed to fetch error item");
    }
}

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    try {
        let user;
        if (session?.user?.email) {
            user = await prisma.user.findUnique({
                where: { email: session.user.email },
            });
        }

        if (!user) {
            user = await prisma.user.findFirst();
        }

        if (!user) {
            return unauthorized();
        }

        const body = await req.json();
        const {
            knowledgePoints,
            gradeSemester,
            paperLevel,
            questionText,
            answerText,
            analysis,
            rawImageKey,
            cropImageKey,
            structuredJson,
        } = body;

        const errorItem = await prisma.errorItem.findUnique({
            where: { id },
            include: { subject: true },
        });

        if (!errorItem) {
            return notFound("Item not found");
        }

        if (errorItem.userId !== user.id) {
            return forbidden("Not authorized to update this item");
        }

        // Build update payload
        const updateData: Prisma.ErrorItemUpdateInput = {};
        if (gradeSemester !== undefined) updateData.gradeSemester = gradeSemester;
        if (paperLevel !== undefined) updateData.paperLevel = paperLevel;
        if (questionText !== undefined) updateData.questionText = questionText;
        if (answerText !== undefined) updateData.answerText = answerText;
        if (analysis !== undefined) updateData.analysis = analysis;
        if (rawImageKey !== undefined) updateData.rawImageKey = rawImageKey || null;
        if (cropImageKey !== undefined) updateData.cropImageKey = cropImageKey || null;
        const normalizedStructuredJson = normalizeStructuredQuestionJson(structuredJson);
        if (normalizedStructuredJson !== null) {
            updateData.structuredJson = normalizedStructuredJson;
        } else if (structuredJson === undefined) {
            const fallbackStructuredJson = buildStructuredQuestionJson({
                questionText: questionText !== undefined ? questionText : errorItem.questionText,
                answerText: answerText !== undefined ? answerText : errorItem.answerText,
                analysis: analysis !== undefined ? analysis : errorItem.analysis,
            });

            if (fallbackStructuredJson) {
                updateData.structuredJson = fallbackStructuredJson;
            }
        } else if (structuredJson === null) {
            updateData.structuredJson = Prisma.JsonNull;
        }
        // Handle knowledgePoints (tags)
        if (knowledgePoints !== undefined) {
            const tagNames: string[] = Array.isArray(knowledgePoints)
                ? knowledgePoints
                : typeof knowledgePoints === 'string'
                    ? JSON.parse(knowledgePoints)
                    : [];

            // Subject is locked to math
            const subjectKey = 'math';

            const tagConnections: { id: string }[] = [];
            for (const tagName of tagNames) {
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
                    // Determine grade context for the new tag
                    // Use the incoming gradeSemester (priority) or the existing one on the item
                    const contextGrade = gradeSemester !== undefined ? gradeSemester : errorItem.gradeSemester;

                    const parentId = await findParentTagIdForGrade(contextGrade, subjectKey);

                    tag = await prisma.knowledgeTag.create({
                        data: {
                            name: tagName,
                            subject: subjectKey,
                            isSystem: false,
                            userId: user.id,
                            parentId: parentId, // Link to Grade node
                        },
                    });
                }
                tagConnections.push({ id: tag.id });
            }

            // Reset then reconnect all tag relations.
            updateData.tags = {
                set: [], // clear existing links first
                connect: tagConnections,
            };

            // Keep legacy field for backward compatibility.
            updateData.knowledgePoints = JSON.stringify(tagNames);
        }

        logger.info({ id }, 'Updating error item');

        const updated = await prisma.errorItem.update({
            where: { id },
            data: updateData,
            include: { tags: true },
        });

        return NextResponse.json(updated);
    } catch (error) {
        logger.error({ error }, 'Error updating item');
        return internalError("Failed to update error item");
    }
}

