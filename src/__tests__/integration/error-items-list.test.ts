import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServerSession } from "next-auth";

const mocks = vi.hoisted(() => ({
    mockPrismaUser: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
    },
    mockPrismaErrorItem: {
        count: vi.fn(),
        findMany: vi.fn(),
    },
    mockSession: {
        user: {
            email: "user@example.com",
            name: "Test User",
        },
        expires: "2026-12-31",
    },
    mockWhereClause: {
        userId: "user-1",
    },
}));

vi.mock("next-auth", () => ({
    getServerSession: vi.fn(() => Promise.resolve(mocks.mockSession)),
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: mocks.mockPrismaUser,
        errorItem: mocks.mockPrismaErrorItem,
    },
}));

vi.mock("@/lib/error-item-filters", () => ({
    buildErrorItemWhereClause: vi.fn(() => mocks.mockWhereClause),
}));

vi.mock("@/lib/supabase-storage", () => ({
    createSignedObjectUrl: vi.fn(async () => "https://example.com/signed-url"),
}));

import { GET } from "@/app/api/error-items/list/route";

describe("/api/error-items/list", () => {
    const user = {
        id: "user-1",
        email: "user@example.com",
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(
            mocks.mockSession as unknown as Awaited<ReturnType<typeof getServerSession>>
        );
        mocks.mockPrismaUser.findUnique.mockResolvedValue(user);
        mocks.mockPrismaUser.findFirst.mockResolvedValue(user);
        mocks.mockPrismaErrorItem.count.mockResolvedValue(0);
        mocks.mockPrismaErrorItem.findMany.mockResolvedValue([]);
    });

    it("defaults to createdAt descending order", async () => {
        const response = await GET(new Request("http://localhost/api/error-items/list?page=1&pageSize=20"));

        expect(response.status).toBe(200);
        expect(mocks.mockPrismaErrorItem.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: { createdAt: "desc" },
            })
        );
    });

    it("supports createdAt ascending order for print preview", async () => {
        const response = await GET(
            new Request("http://localhost/api/error-items/list?page=1&pageSize=20&sort=createdAtAsc")
        );

        expect(response.status).toBe(200);
        expect(mocks.mockPrismaErrorItem.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: { createdAt: "asc" },
            })
        );
    });
});
