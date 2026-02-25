import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, forbidden, notFound, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:notebooks:id');
const MATH_NOTEBOOK_NAME = "Math";

function isMathNotebookName(name: string) {
    const normalized = name.trim().toLowerCase();
    return normalized === 'math' || normalized === '数学';
}

/**
 * GET /api/notebooks/[id]
 * 获取单个错题本详情
 */
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
            user = await prisma.user.findFirst();
        }

        if (!user) {
            // Create default user if DB is empty
            user = await prisma.user.create({
                data: {
                    email: "default@example.com",
                    password: "password",
                    name: "Default User",
                },
            });
        }

        if (!user) {
            return unauthorized();
        }

        const notebook = await prisma.subject.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        errorItems: true,
                    },
                },
            },
        });

        if (!notebook) {
            return notFound("Notebook not found");
        }

        if (notebook.userId !== user.id) {
            return forbidden("Not authorized to access this notebook");
        }

        if (!isMathNotebookName(notebook.name)) {
            return notFound("Notebook not found");
        }

        return NextResponse.json(notebook);
    } catch (error) {
        logger.error({ error }, 'Error fetching notebook');
        return internalError("Failed to fetch notebook");
    }
}

/**
 * PUT /api/notebooks/[id]
 * 更新错题本信息
 */
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
            // Create default user if DB is empty
            user = await prisma.user.create({
                data: {
                    email: "default@example.com",
                    password: "password",
                    name: "Default User",
                },
            });
        }

        if (!user) {
            return unauthorized();
        }

        const notebook = await prisma.subject.findUnique({
            where: { id },
        });

        if (!notebook) {
            return notFound("Notebook not found");
        }

        if (notebook.userId !== user.id) {
            return forbidden("Not authorized to update this notebook");
        }

        if (!isMathNotebookName(notebook.name)) {
            return notFound("Notebook not found");
        }

        const body = await req.json();
        const { name } = body;

        if (!name || !name.trim() || name.trim() !== MATH_NOTEBOOK_NAME) {
            return badRequest("Subject is locked to Math in MVP");
        }

        const updated = await prisma.subject.update({
            where: { id },
            data: {
                name: name.trim(),
            },
            include: {
                _count: {
                    select: {
                        errorItems: true,
                    },
                },
            },
        });

        return NextResponse.json(updated);
    } catch (error) {
        logger.error({ error }, 'Error updating notebook');
        return internalError("Failed to update notebook");
    }
}

/**
 * DELETE /api/notebooks/[id]
 * 删除错题本
 */
export async function DELETE(
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
            // Create default user if DB is empty
            user = await prisma.user.create({
                data: {
                    email: "default@example.com",
                    password: "password",
                    name: "Default User",
                },
            });
        }

        if (!user) {
            return unauthorized();
        }

        const notebook = await prisma.subject.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        errorItems: true,
                    },
                },
            },
        });

        if (!notebook) {
            return notFound("Notebook not found");
        }

        if (notebook.userId !== user.id) {
            return forbidden("Not authorized to delete this notebook");
        }

        if (!isMathNotebookName(notebook.name)) {
            return notFound("Notebook not found");
        }

        // 检查是否有错题
        if (notebook._count.errorItems > 0) {
            return badRequest("Cannot delete notebook with error items. Please move or delete all items first.");
        }

        return badRequest("Subject is locked to Math in MVP");
    } catch (error) {
        logger.error({ error }, 'Error deleting notebook');
        return internalError("Failed to delete notebook");
    }
}
