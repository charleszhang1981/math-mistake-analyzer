import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateRootCauseChatReply, RootCauseChatTurn } from "@/lib/root-cause-chat";
import { badRequest } from "@/lib/api-errors";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const turns = Array.isArray(body?.turns) ? body.turns : [];
        const safeTurns: RootCauseChatTurn[] = turns
            .filter((turn: any) => turn && (turn.role === "user" || turn.role === "assistant"))
            .map((turn: any) => ({
                role: turn.role,
                content: typeof turn.content === "string" ? turn.content : "",
            }));

        const reply = generateRootCauseChatReply({
            questionText: body?.questionText,
            answerText: body?.answerText,
            analysis: body?.analysis,
            checkerJson: body?.checkerJson,
            turns: safeTurns,
        });

        return NextResponse.json(reply);
    } catch {
        return badRequest("Invalid request payload");
    }
}
