/**
 * /api/practice integration tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    mockPrismaErrorItem: {
        findUnique: vi.fn(),
    },
    mockPrismaPracticeRecord: {
        create: vi.fn(),
    },
    mockAIService: {
        generateSimilarQuestion: vi.fn(),
    },
    mockSession: {
        user: {
            id: "user-123",
            email: "user@example.com",
            name: "Test User",
        },
        expires: "2025-12-31",
    },
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        errorItem: mocks.mockPrismaErrorItem,
        practiceRecord: mocks.mockPrismaPracticeRecord,
    },
}));

vi.mock("@/lib/ai", () => ({
    getAIService: vi.fn(() => mocks.mockAIService),
}));

vi.mock("next-auth", () => ({
    getServerSession: vi.fn(() => Promise.resolve(mocks.mockSession)),
}));

vi.mock("@/lib/auth", () => ({
    authOptions: {},
}));

import { POST as GENERATE_POST } from "@/app/api/practice/generate/route";
import { POST as RECORD_POST } from "@/app/api/practice/record/route";
import { getServerSession } from "next-auth";

describe("/api/practice", () => {
    const mockErrorItem = {
        id: "error-item-1",
        questionText: "Solve x + 2 = 5",
        knowledgePoints: '["equation", "move terms"]',
        subject: { id: "math", name: "Math" },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(
            mocks.mockSession as unknown as Awaited<ReturnType<typeof getServerSession>>
        );
    });

    describe("POST /api/practice/generate", () => {
        it("returns generated question", async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: "Solve 2x - 3 = 7",
                answerText: "x = 5",
                analysis: "Add 3 then divide by 2",
                knowledgePoints: ["equation"],
            });

            const request = new Request("http://localhost/api/practice/generate", {
                method: "POST",
                body: JSON.stringify({
                    errorItemId: "error-item-1",
                    language: "en",
                    difficulty: "medium",
                }),
                headers: { "Content-Type": "application/json" },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.questionText).toBe("Solve 2x - 3 = 7");
            expect(data.subject).toBe("数学");
        });

        it("uses medium when difficulty is missing", async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: "Q",
                answerText: "A",
                analysis: "analysis",
                knowledgePoints: [],
            });

            const request = new Request("http://localhost/api/practice/generate", {
                method: "POST",
                body: JSON.stringify({
                    errorItemId: "error-item-1",
                    language: "zh",
                }),
                headers: { "Content-Type": "application/json" },
            });

            await GENERATE_POST(request);

            expect(mocks.mockAIService.generateSimilarQuestion).toHaveBeenCalledWith(
                "Solve x + 2 = 5",
                ["equation", "move terms"],
                "zh",
                "medium"
            );
        });

        it("returns 404 when error item does not exist", async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(null);

            const request = new Request("http://localhost/api/practice/generate", {
                method: "POST",
                body: JSON.stringify({
                    errorItemId: "missing-id",
                    language: "zh",
                }),
                headers: { "Content-Type": "application/json" },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.message).toBe("Item not found");
        });

        it("falls back to empty tags on invalid knowledgePoints JSON", async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
                ...mockErrorItem,
                knowledgePoints: "invalid-json",
            });
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: "Q",
                answerText: "A",
                analysis: "analysis",
                knowledgePoints: [],
            });

            const request = new Request("http://localhost/api/practice/generate", {
                method: "POST",
                body: JSON.stringify({
                    errorItemId: "error-item-1",
                    language: "zh",
                }),
                headers: { "Content-Type": "application/json" },
            });

            await GENERATE_POST(request);

            expect(mocks.mockAIService.generateSimilarQuestion).toHaveBeenCalledWith(
                "Solve x + 2 = 5",
                [],
                "zh",
                "medium"
            );
        });

        it("normalizes AI service failures", async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            mocks.mockAIService.generateSimilarQuestion.mockRejectedValue(new Error("AI service unavailable"));

            const request = new Request("http://localhost/api/practice/generate", {
                method: "POST",
                body: JSON.stringify({
                    errorItemId: "error-item-1",
                    language: "zh",
                }),
                headers: { "Content-Type": "application/json" },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(503);
            expect(data.message).toBe("AI_SERVICE_UNAVAILABLE");
        });
    });

    describe("POST /api/practice/record", () => {
        it("saves a valid math practice record", async () => {
            mocks.mockPrismaPracticeRecord.create.mockResolvedValue({
                id: "record-1",
                userId: "user-123",
                subject: "数学",
                difficulty: "medium",
                isCorrect: true,
                createdAt: new Date(),
            });

            const request = new Request("http://localhost/api/practice/record", {
                method: "POST",
                body: JSON.stringify({
                    subject: "math",
                    difficulty: "medium",
                    isCorrect: true,
                }),
                headers: { "Content-Type": "application/json" },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.subject).toBe("数学");
        });

        it("rejects non-math subject", async () => {
            const request = new Request("http://localhost/api/practice/record", {
                method: "POST",
                body: JSON.stringify({
                    subject: "English",
                    difficulty: "medium",
                    isCorrect: true,
                }),
                headers: { "Content-Type": "application/json" },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.message).toBe("Subject is locked to Math in MVP");
        });
    });
});
