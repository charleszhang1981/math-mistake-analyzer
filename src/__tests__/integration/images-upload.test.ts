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
        findFirst: vi.fn(),
    },
    mockStorage: {
        uploadPrivateObject: vi.fn(),
        createSignedObjectUrl: vi.fn(),
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
    },
}));

vi.mock("@/lib/supabase-storage", () => ({
    uploadPrivateObject: mocks.mockStorage.uploadPrivateObject,
    createSignedObjectUrl: mocks.mockStorage.createSignedObjectUrl,
}));

import { getServerSession } from "next-auth";
import { POST } from "@/app/api/images/upload/route";

function buildUploadRequest(kind: string = "raw"): Request {
    const formData = new FormData();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const file = new File([bytes], "question.jpg", {
        type: "image/jpeg",
    });
    if (typeof (file as any).arrayBuffer !== "function") {
        (file as any).arrayBuffer = async () => bytes.buffer;
    }
    formData.append("file", file);
    formData.append("kind", kind);

    return {
        formData: vi.fn().mockResolvedValue(formData),
    } as unknown as Request;
}

describe("/api/images/upload", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession as any);
        mocks.mockPrismaUser.findUnique.mockResolvedValue({ id: "user-1" });
        mocks.mockPrismaUser.findFirst.mockResolvedValue({ id: "fallback-user-1" });
        mocks.mockStorage.uploadPrivateObject.mockResolvedValue(undefined);
        mocks.mockStorage.createSignedObjectUrl.mockResolvedValue("https://example.com/signed");
    });

    it("returns 200 and key even when signed URL creation fails", async () => {
        mocks.mockStorage.createSignedObjectUrl.mockRejectedValue(new Error("sign failed"));

        const response = await POST(buildUploadRequest("crop"));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.key).toMatch(/^crop\/user-1\//);
        expect(data.signedUrl).toBeNull();
        expect(mocks.mockStorage.uploadPrivateObject).toHaveBeenCalledTimes(1);
    });

    it("falls back to session-based storage key when user lookup throws", async () => {
        mocks.mockPrismaUser.findUnique.mockRejectedValue(new Error("db down"));

        const response = await POST(buildUploadRequest("raw"));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.key).toMatch(/^raw\/mail_user-example-com\//);
        expect(mocks.mockPrismaUser.findFirst).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid upload kind", async () => {
        const response = await POST(buildUploadRequest("invalid"));
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toBe("Invalid upload kind");
    });

    it("continues when session lookup throws and still uploads via fallback user", async () => {
        vi.mocked(getServerSession).mockRejectedValue(new Error("session store unavailable"));

        const response = await POST(buildUploadRequest("raw"));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.key).toMatch(/^raw\/fallback-user-1\//);
        expect(mocks.mockPrismaUser.findFirst).toHaveBeenCalledTimes(1);
    });
});
