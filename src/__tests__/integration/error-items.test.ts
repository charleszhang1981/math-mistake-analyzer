import { beforeEach, describe, expect, it, vi } from "vitest";
import { getServerSession } from "next-auth";

const mocks = vi.hoisted(() => ({
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
    mockSession: {
        user: {
            email: "user@example.com",
            name: "Test User",
        },
        expires: "2026-12-31",
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
import { GET as GET_ITEM, PUT } from "@/app/api/error-items/[id]/route";

describe("/api/error-items", () => {
    const user = {
        id: "user-1",
        email: "user@example.com",
        educationStage: "junior_high",
        enrollmentYear: 2025,
    };

    const mathNotebook = { id: "subject-math-id", name: "Math", userId: user.id };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(
            mocks.mockSession as unknown as Awaited<ReturnType<typeof getServerSession>>
        );

        mocks.mockPrismaUser.findUnique.mockResolvedValue(user);
        mocks.mockPrismaUser.findFirst.mockResolvedValue(user);

        mocks.mockPrismaSubject.findFirst.mockResolvedValue(mathNotebook);
        mocks.mockPrismaSubject.create.mockResolvedValue(mathNotebook);
        mocks.mockPrismaSubject.update.mockResolvedValue(mathNotebook);

        mocks.mockPrismaErrorItem.findFirst.mockResolvedValue(null);

        mocks.mockPrismaKnowledgeTag.findFirst.mockImplementation(async (args: unknown) => {
            const name = (args as { where?: { name?: string } })?.where?.name;
            return name
                ? { id: `tag-${name}`, name, subject: "math", isSystem: false, userId: user.id, parentId: null }
                : null;
        });
        mocks.mockPrismaKnowledgeTag.create.mockImplementation(async (args: unknown) => {
            const data = (args as { data: { name: string } & Record<string, unknown> }).data;
            return {
                id: `tag-${data.name}`,
                ...data,
            };
        });
    });

    it("POST creates item with structuredJson and no checker/diagnosis", async () => {
        mocks.mockPrismaErrorItem.create.mockResolvedValue({
            id: "item-1",
            userId: user.id,
            subjectId: mathNotebook.id,
            questionText: "Solve x + 2 = 5",
            answerText: "x = 4",
            analysis: "Move +2 to right side",
            knowledgePoints: "[]",
            originalImageUrl: "storage:raw/test.jpg",
            rawImageKey: "raw/test.jpg",
            cropImageKey: null,
            structuredJson: null,
            masteryLevel: 0,
            tags: [],
        });

        const request = new Request("http://localhost/api/error-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                questionText: "Solve x + 2 = 5",
                answerText: "x = 4",
                analysis: "Move +2 to right side",
                knowledgePoints: ["equation"],
                originalImageUrl: "storage:raw/test.jpg",
                rawImageKey: "raw/test.jpg",
            }),
        });

        const response = await POST(request);
        expect(response.status).toBe(201);

        const createArg = mocks.mockPrismaErrorItem.create.mock.calls[0][0];
        expect(createArg.data.structuredJson).toBeDefined();
        expect(createArg.data.checkerJson).toBeUndefined();
        expect(createArg.data.diagnosisJson).toBeUndefined();
    });

    it("GET /api/error-items/[id] returns item and enforces ownership", async () => {
        const item = {
            id: "item-2",
            userId: user.id,
            subjectId: mathNotebook.id,
            questionText: "Q",
            answerText: "A",
            analysis: "analysis",
            knowledgePoints: "[]",
            originalImageUrl: "storage:raw/key.jpg",
            rawImageKey: "raw/key.jpg",
            cropImageKey: null,
            masteryLevel: 0,
            tags: [],
            subject: mathNotebook,
        };
        mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(item);

        const response = await GET_ITEM(new Request("http://localhost/api/error-items/item-2"), {
            params: Promise.resolve({ id: "item-2" }),
        });

        expect(response.status).toBe(200);
    });

    it("GET /api/error-items/[id] returns 404 for missing item", async () => {
        mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(null);

        const response = await GET_ITEM(new Request("http://localhost/api/error-items/missing"), {
            params: Promise.resolve({ id: "missing" }),
        });
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toBe("Item not found");
    });

    it("PUT updates structuredJson and does not write checker/diagnosis", async () => {
        const existing = {
            id: "item-3",
            userId: user.id,
            questionText: "Old question",
            answerText: "Old answer",
            analysis: "Old analysis",
            gradeSemester: "Grade 7, Semester 1",
            structuredJson: null,
            subject: mathNotebook,
        };

        mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(existing);
        mocks.mockPrismaErrorItem.update.mockResolvedValue({
            ...existing,
            questionText: "New question",
            answerText: "x = 4",
            analysis: "step 1\nstep 2",
        });

        const request = new Request("http://localhost/api/error-items/item-3", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                questionText: "New question",
                answerText: "x = 4",
                analysis: "step 1\nstep 2",
            }),
        });

        const response = await PUT(request, { params: Promise.resolve({ id: "item-3" }) });
        expect(response.status).toBe(200);

        const updateArg = mocks.mockPrismaErrorItem.update.mock.calls[0][0];
        expect(updateArg.data.structuredJson).toBeDefined();
        expect(updateArg.data.checkerJson).toBeUndefined();
        expect(updateArg.data.diagnosisJson).toBeUndefined();
    });

    it("PUT persists structured rootCause.confirmedCause", async () => {
        const structured = {
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
                steps: ["Move +2 to the right side"],
            },
            knowledge: { tags: [] },
            solution: {
                finalAnswer: "x = 4",
                steps: ["Move +2 to the right side"],
            },
            mistake: {
                studentSteps: ["Move +2 to the right side"],
                studentAnswer: null,
                wrongStepIndex: null,
                whyWrong: "",
                fixSuggestion: "",
            },
            rootCause: {
                studentHypothesis: "",
                confirmedCause: "Sign error when moving terms",
                chatSummary: "",
            },
        };

        const existing = {
            id: "item-4",
            userId: user.id,
            questionText: "Solve x + 2 = 5",
            answerText: "x = 4",
            analysis: "analysis",
            gradeSemester: "Grade 7, Semester 1",
            structuredJson: structured,
            subject: mathNotebook,
        };

        mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(existing);
        mocks.mockPrismaErrorItem.update.mockResolvedValue({
            ...existing,
            structuredJson: structured,
        });

        const request = new Request("http://localhost/api/error-items/item-4", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ structuredJson: structured }),
        });

        const response = await PUT(request, { params: Promise.resolve({ id: "item-4" }) });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.structuredJson.rootCause.confirmedCause).toBe("Sign error when moving terms");
    });
});
