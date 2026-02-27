import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/api-errors";
import { generateRootCauseChatReply, RootCauseChatTurn } from "@/lib/root-cause-chat";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
        return badRequest("Missing error item id");
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true },
        });
        if (!user) {
            return NextResponse.json({ message: "User not found" }, { status: 404 });
        }

        const item = await prisma.errorItem.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                questionText: true,
                answerText: true,
                analysis: true,
                checkerJson: true,
            },
        });

        if (!item) {
            return NextResponse.json({ message: "Error item not found" }, { status: 404 });
        }
        if (item.userId !== user.id) {
            return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const turns = Array.isArray(body?.turns) ? body.turns : [];
        const safeTurns: RootCauseChatTurn[] = turns
            .filter((turn: any) => turn && (turn.role === "user" || turn.role === "assistant"))
            .map((turn: any) => ({
                role: turn.role,
                content: typeof turn.content === "string" ? turn.content : "",
            }));

        const reply = generateRootCauseChatReply({
            questionText: item.questionText,
            answerText: item.answerText,
            analysis: item.analysis,
            checkerJson: item.checkerJson,
            turns: safeTurns,
        });

        return NextResponse.json(reply);
    } catch {
        return badRequest("Invalid request payload");
    }
}
