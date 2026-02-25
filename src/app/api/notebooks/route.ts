import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, badRequest, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:notebooks');
const MATH_NOTEBOOK_NAME = "Math";

async function ensureMathNotebook(userId: string) {
    let notebook = await prisma.subject.findFirst({
        where: {
            userId,
            name: MATH_NOTEBOOK_NAME,
        },
        include: {
            _count: {
                select: {
                    errorItems: true,
                },
            },
        },
    });

    if (!notebook) {
        const legacyNotebook = await prisma.subject.findFirst({
            where: {
                userId,
                OR: [
                    { name: "数学" },
                    { name: "math" },
                ],
            },
            include: {
                _count: {
                    select: {
                        errorItems: true,
                    },
                },
            },
        });

        if (legacyNotebook) {
            notebook = await prisma.subject.update({
                where: { id: legacyNotebook.id },
                data: { name: MATH_NOTEBOOK_NAME },
                include: {
                    _count: {
                        select: {
                            errorItems: true,
                        },
                    },
                },
            });
        }
    }

    if (!notebook) {
        notebook = await prisma.subject.create({
            data: {
                name: MATH_NOTEBOOK_NAME,
                userId,
            },
            include: {
                _count: {
                    select: {
                        errorItems: true,
                    },
                },
            },
        });
    }

    return notebook;
}

/**
 * GET /api/notebooks
 * 获取用户所有错题本（Subjects）
 */
export async function GET() {
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

        const mathNotebook = await ensureMathNotebook(user.id);
        return NextResponse.json([mathNotebook]);
    } catch (error) {
        logger.error({ error }, 'Error fetching notebooks');
        return internalError("Failed to fetch notebooks");
    }
}

/**
 * POST /api/notebooks
 * 创建新错题本
 */
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

        await req.json();
        return badRequest("Subject is locked to Math in MVP");
    } catch (error) {
        logger.error({ error }, 'Error creating notebook');
        return internalError("Failed to create notebook");
    }
}
