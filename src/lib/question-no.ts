import type { PrismaClient } from "@prisma/client";

function toDatePrefix(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
}

export function buildQuestionNo(prefix: string, seq: number): string {
    const normalizedSeq = Number.isInteger(seq) && seq > 0 ? seq : 1;
    const suffix = normalizedSeq <= 999
        ? String(normalizedSeq).padStart(3, "0")
        : String(normalizedSeq);
    return `${prefix}${suffix}`;
}

export async function generateNextQuestionNo(
    prisma: PrismaClient,
    userId: string,
    now: Date = new Date()
): Promise<string> {
    const prefix = toDatePrefix(now);

    const latest = await prisma.errorItem.findFirst({
        where: {
            userId,
            questionNo: {
                startsWith: prefix,
            },
        },
        orderBy: {
            questionNo: "desc",
        },
        select: {
            questionNo: true,
        },
    });

    const latestSuffix = latest?.questionNo?.slice(prefix.length) || "";
    const parsed = Number.parseInt(latestSuffix, 10);
    const nextSeq = Number.isNaN(parsed) ? 1 : parsed + 1;

    return buildQuestionNo(prefix, nextSeq);
}
