import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServerSession } from "next-auth";

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
        findFirst: vi.fn(),
    },
    mockPrismaErrorItem: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
    },
    mockPrismaKnowledgeTag: {
        findFirst: vi.fn(),
        create: vi.fn(),
    },
    mockPrismaSubject: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
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
        knowledgeTag: mocks.mockPrismaKnowledgeTag,
        subject: mocks.mockPrismaSubject,
    },
}));

vi.mock("@/lib/grade-calculator", () => ({
    calculateGrade: vi.fn(() => "Grade 7, Semester 1"),
}));

vi.mock("@/lib/tag-recognition", () => ({
    findParentTagIdForGrade: vi.fn(async () => null),
}));

vi.mock("@/lib/supabase-storage", () => ({
    createSignedObjectUrl: vi.fn(async () => "https://example.com/signed-url"),
}));

import { POST } from "@/app/api/error-items/route";
import { PUT } from "@/app/api/error-items/[id]/route";

function makeStructured(confirmedCause: string) {
    return {
        version: "v2",
        problem: {
            stage: "junior_high",
            topic: "equation",
            question_markdown: "Solve x + 2 = 5",
            given: [],
            ask: "Solve x + 2 = 5",
        },
        student: {
            final_answer_markdown: "x = 4",
            steps: ["x + 2 = 5", "x = 4"],
        },
        knowledge: { tags: [] },
        solution: {
            finalAnswer: "x = 3",
            steps: ["Subtract 2 on both sides", "x = 3"],
        },
        mistake: {
            studentSteps: ["x + 2 = 5", "x = 4"],
            studentAnswer: "x = 4",
            wrongStepIndex: 1,
            whyWrong: "Sign handling error.",
            fixSuggestion: "Subtract 2 from both sides.",
        },
        rootCause: {
            studentHypothesis: "",
            confirmedCause,
            chatSummary: "",
        },
    };
}

describe("error-items root-cause sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(
            mocks.mockSession as unknown as Awaited<ReturnType<typeof getServerSession>>
        );

        const user = {
            id: "user-1",
            email: "user@example.com",
            educationStage: "junior_high",
            enrollmentYear: 2025,
        };
        mocks.mockPrismaUser.findUnique.mockResolvedValue(user);
        mocks.mockPrismaUser.findFirst.mockResolvedValue(user);

        const mathNotebook = { id: "subject-math-id", name: "Math", userId: user.id };
        mocks.mockPrismaSubject.findFirst.mockResolvedValue(mathNotebook);
        mocks.mockPrismaSubject.create.mockResolvedValue(mathNotebook);
        mocks.mockPrismaSubject.update.mockResolvedValue(mathNotebook);

        mocks.mockPrismaErrorItem.findFirst.mockResolvedValue(null);
        mocks.mockPrismaKnowledgeTag.findFirst.mockResolvedValue(null);
        mocks.mockPrismaKnowledgeTag.create.mockResolvedValue({
            id: "tag-created",
            name: "equation",
            subject: "math",
            isSystem: false,
            userId: user.id,
            parentId: null,
        });
    });

    it("POST keeps root cause only in structuredJson", async () => {
        const structured = makeStructured("From structured");

        mocks.mockPrismaErrorItem.create.mockResolvedValue({
            id: "item-1",
            userId: "user-1",
            subjectId: "subject-math-id",
            questionText: "Solve x + 2 = 5",
            answerText: "x = 4",
            analysis: "analysis",
            knowledgePoints: "[]",
            originalImageUrl: "storage:raw/test.jpg",
            rawImageKey: "raw/test.jpg",
            cropImageKey: null,
            structuredJson: structured,
            masteryLevel: 0,
            tags: [],
        });

        const request = new Request("http://localhost/api/error-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                questionText: "Solve x + 2 = 5",
                answerText: "x = 4",
                analysis: "analysis",
                knowledgePoints: [],
                originalImageUrl: "storage:raw/test.jpg",
                rawImageKey: "raw/test.jpg",
                structuredJson: structured,
            }),
        });

        const response = await POST(request);
        expect(response.status).toBe(201);

        const createArg = mocks.mockPrismaErrorItem.create.mock.calls[0][0];
        expect(createArg.data.structuredJson.rootCause.confirmedCause).toBe("From structured");
        expect(createArg.data.diagnosisJson).toBeUndefined();
        expect(createArg.data.checkerJson).toBeUndefined();
    });

    it("PUT diagnosis-only payload does not mutate structured root cause", async () => {
        const existing = {
            id: "item-2",
            userId: "user-1",
            subjectId: "subject-math-id",
            questionText: "Solve x + 2 = 5",
            answerText: "x = 4",
            analysis: "analysis",
            gradeSemester: "Grade 7, Semester 1",
            structuredJson: makeStructured("Old cause"),
        };
        mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(existing);
        mocks.mockPrismaErrorItem.update.mockResolvedValue({
            ...existing,
            structuredJson: makeStructured("Old cause"),
        });

        const request = new Request("http://localhost/api/error-items/item-2", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                diagnosisJson: {
                    version: "rule_v2",
                    candidates: [],
                    finalCause: "From diagnosis edit",
                },
            }),
        });

        const response = await PUT(request, { params: Promise.resolve({ id: "item-2" }) });
        expect(response.status).toBe(200);

        const updateArg = mocks.mockPrismaErrorItem.update.mock.calls[0][0];
        expect(updateArg.data.structuredJson).toBeDefined();
        expect(updateArg.data.structuredJson.rootCause.confirmedCause).toBe("");
        expect(updateArg.data.diagnosisJson).toBeUndefined();
    });
});
