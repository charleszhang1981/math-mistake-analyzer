import type { Prisma } from "@prisma/client";

export interface ErrorItemFilterInput {
    userId: string;
    subjectId?: string | null;
    query?: string | null;
    mastery?: string | null;
    timeRange?: string | null;
    tag?: string | null;
    gradeSemester?: string | null;
    paperLevel?: string | null;
    ids?: string[] | null;
}

function normalizeMasteryFilter(mastery?: string | null): { gt: number } | 0 | null {
    if (!mastery || mastery === "all") return null;
    if (mastery === "1" || mastery === "mastered") return { gt: 0 };
    if (mastery === "0" || mastery === "unmastered") return 0;
    return null;
}

export function buildErrorItemWhereClause(filters: ErrorItemFilterInput): Prisma.ErrorItemWhereInput {
    const whereClause: Prisma.ErrorItemWhereInput = {
        userId: filters.userId,
    };
    const andConditions: Prisma.ErrorItemWhereInput[] = [];

    if (filters.subjectId) {
        whereClause.subjectId = filters.subjectId;
    }

    if (filters.ids && filters.ids.length > 0) {
        whereClause.id = { in: filters.ids };
    }

    const query = (filters.query || "").trim();
    if (query) {
        andConditions.push({
            OR: [
                { questionNo: { startsWith: query } },
                { questionText: { contains: query } },
                { analysis: { contains: query } },
                { knowledgePoints: { contains: query } },
            ],
        });
    }

    const masteryFilter = normalizeMasteryFilter(filters.mastery);
    if (masteryFilter !== null) {
        whereClause.masteryLevel = masteryFilter;
    }

    if (filters.timeRange && filters.timeRange !== "all") {
        const now = new Date();
        const startDate = new Date();

        if (filters.timeRange === "week") {
            startDate.setDate(now.getDate() - 7);
        } else if (filters.timeRange === "month") {
            startDate.setMonth(now.getMonth() - 1);
        }

        whereClause.createdAt = {
            gte: startDate,
        };
    }

    if (filters.tag) {
        andConditions.push({
            OR: [
                { knowledgePoints: { contains: filters.tag } },
                { tags: { some: { name: filters.tag } } },
            ],
        });
    }

    if (filters.gradeSemester) {
        whereClause.gradeSemester = {
            contains: filters.gradeSemester,
        };
    }

    if (filters.paperLevel && filters.paperLevel !== "all") {
        whereClause.paperLevel = filters.paperLevel;
    }

    if (andConditions.length > 0) {
        whereClause.AND = andConditions;
    }

    return whereClause;
}
