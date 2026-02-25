/**
 * /api/notebooks API 集成测试（MVP：math-only）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    mockPrismaUser: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
    },
    mockPrismaSubject: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
    mockSession: {
        user: {
            email: 'user@example.com',
            name: 'Test User',
        },
        expires: '2026-12-31',
    },
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        user: mocks.mockPrismaUser,
        subject: mocks.mockPrismaSubject,
    },
}));

vi.mock('next-auth', () => ({
    getServerSession: vi.fn(() => Promise.resolve(mocks.mockSession)),
}));

vi.mock('@/lib/auth', () => ({
    authOptions: {},
}));

import { GET, POST } from '@/app/api/notebooks/route';
import { GET as GET_NOTEBOOK, PUT, DELETE } from '@/app/api/notebooks/[id]/route';
import { getServerSession } from 'next-auth';

describe('/api/notebooks (math-only)', () => {
    const mockUser = {
        id: 'user-123',
        email: 'user@example.com',
        name: 'Test User',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockPrismaUser.findUnique.mockResolvedValue(mockUser);
        mocks.mockPrismaUser.findFirst.mockResolvedValue(mockUser);
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession as any);
    });

    it('GET returns a single Math notebook', async () => {
        mocks.mockPrismaSubject.findFirst.mockResolvedValue({
            id: 'math-1',
            name: 'Math',
            userId: mockUser.id,
            _count: { errorItems: 2 },
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(Array.isArray(data)).toBe(true);
        expect(data).toHaveLength(1);
        expect(data[0].name).toBe('Math');
    });

    it('POST is blocked by subject lock', async () => {
        const request = new Request('http://localhost/api/notebooks', {
            method: 'POST',
            body: JSON.stringify({ name: 'Physics' }),
            headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toBe('Subject is locked to Math in MVP');
    });

    it('PUT only accepts Math as notebook name', async () => {
        mocks.mockPrismaSubject.findUnique.mockResolvedValue({
            id: 'math-1',
            name: 'Math',
            userId: mockUser.id,
        });

        const request = new Request('http://localhost/api/notebooks/math-1', {
            method: 'PUT',
            body: JSON.stringify({ name: 'Physics' }),
            headers: { 'Content-Type': 'application/json' },
        });

        const response = await PUT(request, { params: Promise.resolve({ id: 'math-1' }) });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toBe('Subject is locked to Math in MVP');
    });

    it('DELETE is blocked by subject lock', async () => {
        mocks.mockPrismaSubject.findUnique.mockResolvedValue({
            id: 'math-1',
            name: 'Math',
            userId: mockUser.id,
            _count: { errorItems: 0 },
        });

        const request = new Request('http://localhost/api/notebooks/math-1', {
            method: 'DELETE',
        });

        const response = await DELETE(request, { params: Promise.resolve({ id: 'math-1' }) });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toBe('Subject is locked to Math in MVP');
    });

    it('GET by id hides non-math notebooks', async () => {
        mocks.mockPrismaSubject.findUnique.mockResolvedValue({
            id: 'eng-1',
            name: 'English',
            userId: mockUser.id,
            _count: { errorItems: 1 },
        });

        const request = new Request('http://localhost/api/notebooks/eng-1');
        const response = await GET_NOTEBOOK(request, { params: Promise.resolve({ id: 'eng-1' }) });
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toBe('Notebook not found');
    });
});
