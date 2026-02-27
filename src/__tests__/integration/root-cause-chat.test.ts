import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    mockSession: {
        user: {
            email: "user@example.com",
            name: "Test User",
        },
        expires: "2026-12-31",
    },
    mockPrismaUser: {
        findUnique: vi.fn(),
    },
    mockPrismaErrorItem: {
        findUnique: vi.fn(),
    },
}));

vi.mock("next-auth", () => ({
    getServerSession: vi.fn(() => Promise.resolve(mocks.mockSession)),
}));

vi.mock("@/lib/auth", () => ({
    authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: mocks.mockPrismaUser,
        errorItem: mocks.mockPrismaErrorItem,
    },
}));

import { getServerSession } from "next-auth";
import { POST as POST_UNSAVED } from "@/app/api/root-cause-chat/route";
import { POST as POST_SAVED } from "@/app/api/error-items/[id]/root-cause-chat/route";

describe("/api/root-cause-chat", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession as any);

        mocks.mockPrismaUser.findUnique.mockResolvedValue({ id: "user-1" });
        mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
            id: "item-1",
            userId: "user-1",
            questionText: "Solve x + 2 = 5",
            answerText: "x=3",
            analysis: "Moved +2 to the other side.",
            checkerJson: {
                engine: "rule_v2",
                type: "linear_equation",
                checkable: true,
                standard_answer: "3",
                student_answer: "4",
                is_correct: false,
                diff: "Expected x = 3, student got x = 4.",
                key_intermediates: [],
            },
        });
    });

    it("returns guided question and summary draft for unsaved flow", async () => {
        const request = new Request("http://localhost/api/root-cause-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                questionText: "Solve x + 2 = 5",
                answerText: "x=3",
                analysis: "Moved +2 to the other side.",
                turns: [
                    { role: "user", content: "I moved +2 to the right side." },
                ],
            }),
        });

        const response = await POST_UNSAVED(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(typeof data.assistantQuestion).toBe("string");
        expect(data.assistantQuestion.length).toBeGreaterThan(0);
        expect(typeof data.summaryDraft).toBe("string");
        expect(data.internalCandidates).toBeUndefined();
    });

    it("returns guided question for saved-item flow", async () => {
        const request = new Request("http://localhost/api/error-items/item-1/root-cause-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                turns: [
                    { role: "user", content: "I probably forgot to change sign." },
                    { role: "assistant", content: "Which step first became uncertain?" },
                    { role: "user", content: "When I moved +2." },
                ],
            }),
        });

        const response = await POST_SAVED(request, { params: Promise.resolve({ id: "item-1" }) });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(typeof data.assistantQuestion).toBe("string");
        expect(data.assistantQuestion.length).toBeGreaterThan(0);
        expect(typeof data.summaryDraft).toBe("string");
    });

    it("returns 401 for unauthorized requests", async () => {
        vi.mocked(getServerSession).mockResolvedValue(null as any);

        const request = new Request("http://localhost/api/root-cause-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ turns: [] }),
        });

        const response = await POST_UNSAVED(request);
        expect(response.status).toBe(401);
    });
});
