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
        delete: vi.fn(),
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
    deletePrivateObjects: vi.fn(async () => undefined),
}));

import { POST } from "@/app/api/error-items/route";
import { GET as GET_ITEM, PUT } from "@/app/api/error-items/[id]/route";
import { DELETE as DELETE_ITEM } from "@/app/api/error-items/[id]/delete/route";
import { deletePrivateObjects } from "@/lib/supabase-storage";

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
            printImageScale: 95,
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
                printImageScale: 95,
            }),
        });

        const response = await POST(request);
        expect(response.status).toBe(201);

        const createArg = mocks.mockPrismaErrorItem.create.mock.calls[0][0];
        expect(createArg.data.printImageScale).toBe(95);
        expect(createArg.data.structuredJson).toBeDefined();
        expect(createArg.data.checkerJson).toBeUndefined();
        expect(createArg.data.diagnosisJson).toBeUndefined();
    });

    it("POST fallback preserves rich G/H fields when provided", async () => {
        mocks.mockPrismaErrorItem.create.mockResolvedValue({
            id: "item-rich",
            userId: user.id,
            subjectId: mathNotebook.id,
            questionText: "Ratio question",
            answerText: "27/20",
            analysis: "Summary only",
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
                questionText: "Ratio question",
                answerText: "27/20",
                analysis: "Summary only",
                solutionFinalAnswer: "27/20",
                solutionSteps: ["Step A", "Step B"],
                mistakeStudentSteps: ["Wrong A", "Wrong B"],
                mistakeWrongStepIndex: 2,
                mistakeWhyWrong: "Division to multiplication conversion was wrong",
                mistakeFixSuggestion: "Invert the divisor first",
                structuredJson: { invalid: true },
                knowledgePoints: ["ratio"],
                originalImageUrl: "storage:raw/test.jpg",
                rawImageKey: "raw/test.jpg",
            }),
        });

        const response = await POST(request);
        expect(response.status).toBe(201);

        const createArg = mocks.mockPrismaErrorItem.create.mock.calls[0][0];
        expect(createArg.data.structuredJson.solution.finalAnswer).toBe("27/20");
        expect(createArg.data.structuredJson.solution.steps).toEqual(["Step A", "Step B"]);
        expect(createArg.data.structuredJson.mistake.studentSteps).toEqual(["Wrong A", "Wrong B"]);
        expect(createArg.data.structuredJson.mistake.wrongStepIndex).toBe(1);
        expect(createArg.data.structuredJson.mistake.whyWrong).toBe("Division to multiplication conversion was wrong");
        expect(createArg.data.structuredJson.mistake.fixSuggestion).toBe("Invert the divisor first");
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

    it("PUT updates printImageScale without touching structured fields", async () => {
        const existing = {
            id: "item-scale",
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
            printImageScale: 105,
        });

        const request = new Request("http://localhost/api/error-items/item-scale", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                printImageScale: 105,
            }),
        });

        const response = await PUT(request, { params: Promise.resolve({ id: "item-scale" }) });
        expect(response.status).toBe(200);

        const updateArg = mocks.mockPrismaErrorItem.update.mock.calls.at(-1)?.[0];
        expect(updateArg.data.printImageScale).toBe(105);
        expect(updateArg.data.structuredJson).toBeUndefined();
    });

    it("PUT fallback preserves rich G/H fields when structuredJson is omitted", async () => {
        const existing = {
            id: "item-rich-put",
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
            answerText: "27/20",
            analysis: "Summary only",
        });

        const request = new Request("http://localhost/api/error-items/item-rich-put", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                answerText: "27/20",
                analysis: "Summary only",
                solutionFinalAnswer: "27/20",
                solutionSteps: ["Step 1", "Step 2"],
                mistakeStudentSteps: ["Wrong 1", "Wrong 2"],
                mistakeWrongStepIndex: 2,
                mistakeWhyWrong: "Wrong reasoning",
                mistakeFixSuggestion: "Use reciprocal",
            }),
        });

        const response = await PUT(request, { params: Promise.resolve({ id: "item-rich-put" }) });
        expect(response.status).toBe(200);

        const updateArg = mocks.mockPrismaErrorItem.update.mock.calls[0][0];
        expect(updateArg.data.structuredJson.solution.steps).toEqual(["Step 1", "Step 2"]);
        expect(updateArg.data.structuredJson.mistake.studentSteps).toEqual(["Wrong 1", "Wrong 2"]);
        expect(updateArg.data.structuredJson.mistake.wrongStepIndex).toBe(1);
        expect(updateArg.data.structuredJson.mistake.whyWrong).toBe("Wrong reasoning");
        expect(updateArg.data.structuredJson.mistake.fixSuggestion).toBe("Use reciprocal");
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

    it("PUT tag-only update preserves existing G/H/I", async () => {
        const structured = {
            version: "v2",
            problem: {
                stage: "primary",
                topic: "ratio",
                question_markdown: "Original question",
                given: [],
                ask: "Original ask",
            },
            student: {
                final_answer_markdown: "27/20",
                steps: ["Student summary"],
            },
            knowledge: { tags: [] },
            solution: {
                finalAnswer: "27/20",
                steps: ["Full G step 1", "Full G step 2"],
            },
            mistake: {
                studentSteps: ["Full H step 1", "Full H step 2"],
                studentAnswer: null,
                wrongStepIndex: 1,
                whyWrong: "Wrong because of division handling",
                fixSuggestion: "Invert the divisor",
            },
            rootCause: {
                studentHypothesis: "",
                confirmedCause: "Careless with reciprocal",
                chatSummary: "",
            },
        };

        const existing = {
            id: "item-preserve-tags",
            userId: user.id,
            questionText: "Original question",
            answerText: "27/20",
            analysis: "Summary only",
            gradeSemester: "Grade 7, Semester 1",
            structuredJson: structured,
            knowledgePoints: "[]",
            subject: mathNotebook,
        };

        mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(existing);
        mocks.mockPrismaErrorItem.update.mockResolvedValue({
            ...existing,
            knowledgePoints: JSON.stringify(["ratio"]),
        });

        const request = new Request("http://localhost/api/error-items/item-preserve-tags", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                knowledgePoints: ["ratio"],
            }),
        });

        const response = await PUT(request, { params: Promise.resolve({ id: "item-preserve-tags" }) });
        expect(response.status).toBe(200);

        const updateArg = mocks.mockPrismaErrorItem.update.mock.calls[0][0];
        expect(updateArg.data.structuredJson).toBeUndefined();
    });

    it("PUT question-text-only update preserves G/H/I and syncs structured problem text", async () => {
        const structured = {
            version: "v2",
            problem: {
                stage: "primary",
                topic: "ratio",
                question_markdown: "Old question",
                given: [],
                ask: "Old question",
            },
            student: {
                final_answer_markdown: "27/20",
                steps: ["Student summary"],
            },
            knowledge: { tags: [] },
            solution: {
                finalAnswer: "27/20",
                steps: ["Full G step 1", "Full G step 2"],
            },
            mistake: {
                studentSteps: ["Full H step 1", "Full H step 2"],
                studentAnswer: null,
                wrongStepIndex: 2,
                whyWrong: "Why wrong",
                fixSuggestion: "How to fix",
            },
            rootCause: {
                studentHypothesis: "",
                confirmedCause: "Root cause kept",
                chatSummary: "",
            },
        };

        const existing = {
            id: "item-preserve-question",
            userId: user.id,
            questionText: "Old question",
            answerText: "27/20",
            analysis: "Summary only",
            gradeSemester: "Grade 7, Semester 1",
            structuredJson: structured,
            knowledgePoints: "[]",
            subject: mathNotebook,
        };

        mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(existing);
        mocks.mockPrismaErrorItem.update.mockResolvedValue({
            ...existing,
            questionText: "New question text",
        });

        const request = new Request("http://localhost/api/error-items/item-preserve-question", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                questionText: "New question text",
            }),
        });

        const response = await PUT(request, { params: Promise.resolve({ id: "item-preserve-question" }) });
        expect(response.status).toBe(200);

        const updateArg = mocks.mockPrismaErrorItem.update.mock.calls[0][0];
        expect(updateArg.data.structuredJson.problem.question_markdown).toBe("New question text");
        expect(updateArg.data.structuredJson.solution.steps).toEqual(["Full G step 1", "Full G step 2"]);
        expect(updateArg.data.structuredJson.mistake.studentSteps).toEqual(["Full H step 1", "Full H step 2"]);
        expect(updateArg.data.structuredJson.rootCause.confirmedCause).toBe("Root cause kept");
    });

    it("DELETE removes deduped storage keys before deleting the item", async () => {
        const existing = {
            id: "item-delete-1",
            userId: user.id,
            originalImageUrl: "storage:crop/item-1.jpg",
            rawImageKey: "raw/item-1.jpg",
            cropImageKey: "crop/item-1.jpg",
        };

        mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(existing);
        mocks.mockPrismaErrorItem.delete.mockResolvedValue(existing);

        const response = await DELETE_ITEM(new Request("http://localhost/api/error-items/item-delete-1/delete", {
            method: "DELETE",
        }), {
            params: Promise.resolve({ id: "item-delete-1" }),
        });

        expect(response.status).toBe(200);
        expect(deletePrivateObjects).toHaveBeenCalledWith({
            keys: ["crop/item-1.jpg", "raw/item-1.jpg"],
        });
        expect(mocks.mockPrismaErrorItem.delete).toHaveBeenCalledWith({
            where: { id: "item-delete-1" },
        });
    });

    it("DELETE skips storage cleanup when the item has no resolvable storage keys", async () => {
        const existing = {
            id: "item-delete-2",
            userId: user.id,
            originalImageUrl: "https://example.com/image.jpg",
            rawImageKey: null,
            cropImageKey: null,
        };

        mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(existing);
        mocks.mockPrismaErrorItem.delete.mockResolvedValue(existing);

        const response = await DELETE_ITEM(new Request("http://localhost/api/error-items/item-delete-2/delete", {
            method: "DELETE",
        }), {
            params: Promise.resolve({ id: "item-delete-2" }),
        });

        expect(response.status).toBe(200);
        expect(deletePrivateObjects).not.toHaveBeenCalled();
        expect(mocks.mockPrismaErrorItem.delete).toHaveBeenCalledWith({
            where: { id: "item-delete-2" },
        });
    });

    it("DELETE aborts database deletion when storage cleanup fails", async () => {
        const existing = {
            id: "item-delete-3",
            userId: user.id,
            originalImageUrl: "storage:raw/item-3.jpg",
            rawImageKey: "raw/item-3.jpg",
            cropImageKey: null,
        };

        mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(existing);
        vi.mocked(deletePrivateObjects).mockRejectedValueOnce(new Error("storage down"));

        const response = await DELETE_ITEM(new Request("http://localhost/api/error-items/item-delete-3/delete", {
            method: "DELETE",
        }), {
            params: Promise.resolve({ id: "item-delete-3" }),
        });
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.message).toBe("Failed to delete error item");
        expect(mocks.mockPrismaErrorItem.delete).not.toHaveBeenCalled();
    });
});
