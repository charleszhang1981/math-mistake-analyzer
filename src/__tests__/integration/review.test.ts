import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const mockPrismaUser = {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
    };

    const mockPrismaErrorItem = {
        findMany: vi.fn(),
        findUnique: vi.fn(),
    };

    const mockPrismaReviewSchedule = {
        findFirst: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
    };

    const tx = {
        reviewSchedule: mockPrismaReviewSchedule,
    };

    return {
        mockPrismaUser,
        mockPrismaErrorItem,
        mockPrismaReviewSchedule,
        mockPrisma: {
            user: mockPrismaUser,
            errorItem: mockPrismaErrorItem,
            reviewSchedule: mockPrismaReviewSchedule,
            $transaction: vi.fn(async (fn: (payload: typeof tx) => unknown) => fn(tx)),
        },
        mockSession: {
            user: {
                email: "user@example.com",
            },
            expires: "2026-12-31",
        },
    };
});

vi.mock("@/lib/prisma", () => ({
    prisma: mocks.mockPrisma,
}));

vi.mock("next-auth", () => ({
    getServerSession: vi.fn(() => Promise.resolve(mocks.mockSession)),
}));

vi.mock("@/lib/auth", () => ({
    authOptions: {},
}));

import { getServerSession } from "next-auth";
import { GET as GET_REVIEW_LIST } from "@/app/api/review/list/route";
import { POST as POST_REVIEW_RECORD } from "@/app/api/review/record/route";

describe("/api/review", () => {
    const mockUser = {
        id: "user-123",
        email: "user@example.com",
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockPrismaUser.findUnique.mockResolvedValue(mockUser);
        vi.mocked(getServerSession).mockResolvedValue(
            mocks.mockSession as unknown as Awaited<ReturnType<typeof getServerSession>>
        );
    });

    it("GET /api/review/list should return due items by default", async () => {
        const now = Date.now();
        mocks.mockPrismaErrorItem.findMany.mockResolvedValue([
            {
                id: "item-due",
                questionText: "Solve x+2=5",
                analysis: "Move +2.",
                diagnosisJson: {
                    version: "rule_v1",
                    candidates: [
                        {
                            cause: "Sign error",
                            trigger: "sign_error",
                            evidence: "Expected 3 got 4",
                            questions_to_ask: [],
                        },
                    ],
                    finalCause: null,
                },
                createdAt: new Date(now - 3600 * 1000),
                tags: [{ name: "linear equation" }],
                reviewSchedules: [],
            },
            {
                id: "item-future",
                questionText: "1/2 + 1/3",
                analysis: null,
                diagnosisJson: null,
                createdAt: new Date(now - 3600 * 1000),
                tags: [{ name: "fraction" }],
                reviewSchedules: [
                    {
                        id: "pending-1",
                        scheduledFor: new Date(now + 2 * 24 * 3600 * 1000),
                        completedAt: null,
                        isCorrect: null,
                        reviewNote: null,
                        createdAt: new Date(now - 1000),
                    },
                ],
            },
        ]);

        const response = await GET_REVIEW_LIST(new Request("http://localhost/api/review/list"));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.total).toBe(1);
        expect(data.items[0].errorItemId).toBe("item-due");
        expect(data.items[0].cause).toBe("Uncategorized");
    });

    it("POST /api/review/record should schedule +3d on correct answer", async () => {
        const now = Date.now();
        mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
            id: "item-1",
            userId: "user-123",
        });
        mocks.mockPrismaReviewSchedule.findFirst.mockResolvedValue({
            id: "pending-1",
            errorItemId: "item-1",
            scheduledFor: new Date(now - 3600 * 1000),
            completedAt: null,
            isCorrect: null,
            reviewNote: null,
            createdAt: new Date(now - 7200 * 1000),
        });
        mocks.mockPrismaReviewSchedule.update.mockResolvedValue({
            id: "pending-1",
        });
        mocks.mockPrismaReviewSchedule.create.mockResolvedValue({
            id: "next-1",
        });

        const response = await POST_REVIEW_RECORD(new Request("http://localhost/api/review/record", {
            method: "POST",
            body: JSON.stringify({
                errorItemId: "item-1",
                isCorrect: true,
                reviewNote: "Now I understand the sign change.",
            }),
            headers: { "Content-Type": "application/json" },
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.intervalDays).toBe(3);
        expect(mocks.mockPrismaReviewSchedule.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "pending-1" },
                data: expect.objectContaining({
                    isCorrect: true,
                    reviewNote: "Now I understand the sign change.",
                    completedAt: expect.any(Date),
                }),
            })
        );
        expect(mocks.mockPrismaReviewSchedule.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    errorItemId: "item-1",
                    scheduledFor: expect.any(Date),
                }),
            })
        );
    });

    it("POST /api/review/record should schedule +1d on incorrect answer without pending row", async () => {
        mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
            id: "item-2",
            userId: "user-123",
        });
        mocks.mockPrismaReviewSchedule.findFirst.mockResolvedValue(null);
        mocks.mockPrismaReviewSchedule.create
            .mockResolvedValueOnce({ id: "completed-1" })
            .mockResolvedValueOnce({ id: "next-2" });

        const response = await POST_REVIEW_RECORD(new Request("http://localhost/api/review/record", {
            method: "POST",
            body: JSON.stringify({
                errorItemId: "item-2",
                isCorrect: false,
            }),
            headers: { "Content-Type": "application/json" },
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.intervalDays).toBe(1);
        expect(mocks.mockPrismaReviewSchedule.create).toHaveBeenCalledTimes(2);
    });
});
