/**
 * /api/practice API 集成测试
 * 测试举一反三功能（生成类似题目和记录练习结果）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mocks are initialized before module imports
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
    mockBuildCheckerJson: vi.fn(),
    mockExtractDiagnosisCause: vi.fn(),
    mockSession: {
        user: {
            id: 'user-123',
            email: 'user@example.com',
            name: 'Test User',
        },
        expires: '2025-12-31',
    },
}));

// Mock Prisma client
vi.mock('@/lib/prisma', () => ({
    prisma: {
        errorItem: mocks.mockPrismaErrorItem,
        practiceRecord: mocks.mockPrismaPracticeRecord,
    },
}));

// Mock AI service
vi.mock('@/lib/ai', () => ({
    getAIService: vi.fn(() => mocks.mockAIService),
}));

vi.mock('@/lib/math-checker', () => ({
    buildCheckerJson: (...args: any[]) => mocks.mockBuildCheckerJson(...args),
}));

vi.mock('@/lib/review-scheduler', () => ({
    extractDiagnosisCause: (...args: any[]) => mocks.mockExtractDiagnosisCause(...args),
}));

// Mock next-auth
vi.mock('next-auth', () => ({
    getServerSession: vi.fn(() => Promise.resolve(mocks.mockSession)),
}));

vi.mock('@/lib/auth', () => ({
    authOptions: {},
}));

// Import after mocks
import { POST as GENERATE_POST } from '@/app/api/practice/generate/route';
import { POST as RECORD_POST } from '@/app/api/practice/record/route';
import { getServerSession } from 'next-auth';

describe('/api/practice', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getServerSession).mockResolvedValue(mocks.mockSession);
        mocks.mockExtractDiagnosisCause.mockReturnValue('Uncategorized');
        mocks.mockBuildCheckerJson.mockReturnValue({
            engine: 'rule_v1',
            type: 'linear_equation',
            checkable: true,
            standard_answer: '5',
            student_answer: '5',
            is_correct: true,
            diff: null,
            key_intermediates: [],
        });
    });

    describe('POST /api/practice/generate (生成类似题目)', () => {
        const mockErrorItem = {
            id: 'error-item-1',
            questionText: '求解 x + 2 = 5',
            knowledgePoints: '["一元一次方程", "移项"]',
            subject: { id: 'math', name: '数学' },
        };

        it('应该成功生成类似题目', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            const aiResult = {
                questionText: '求解 2x - 3 = 7',
                answerText: 'x = 5',
                analysis: '移项得 2x = 10, x = 5',
                knowledgePoints: ['一元一次方程'],
                subject: '数学',
            };
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue(aiResult);

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                    difficulty: 'medium',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.questionText).toBe('求解 2x - 3 = 7');
            expect(data.subject).toBe('数学');
        });

        it('应该支持不同难度级别', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '简单题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            });

            const difficulties = ['easy', 'medium', 'hard', 'harder'];

            for (const difficulty of difficulties) {
                const request = new Request('http://localhost/api/practice/generate', {
                    method: 'POST',
                    body: JSON.stringify({
                        errorItemId: 'error-item-1',
                        language: 'zh',
                        difficulty,
                    }),
                    headers: { 'Content-Type': 'application/json' },
                });

                const response = await GENERATE_POST(request);
                expect(response.status).toBe(200);
            }

            // 验证 AI 服务被调用时使用了不同难度
            expect(mocks.mockAIService.generateSimilarQuestion).toHaveBeenCalledTimes(4);
        });

        it('应该默认使用 medium 难度', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                    // 不指定 difficulty
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            await GENERATE_POST(request);

            expect(mocks.mockAIService.generateSimilarQuestion).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Array),
                'zh',
                'medium' // 默认难度
            );
        });

        it('应该返回 404 当错题不存在', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(null);

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'not-exist',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.message).toBe('Item not found');
        });

        it('应该正确解析知识点标签', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: ['一元一次方程'],
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            await GENERATE_POST(request);

            expect(mocks.mockAIService.generateSimilarQuestion).toHaveBeenCalledWith(
                '求解 x + 2 = 5',
                ['一元一次方程', '移项'], // 解析后的标签数组
                'zh',
                'medium'
            );
        });

        it('应该处理无效的知识点 JSON', async () => {
            const errorItemWithInvalidTags = {
                ...mockErrorItem,
                knowledgePoints: 'invalid json{',
            };
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(errorItemWithInvalidTags);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);

            expect(response.status).toBe(200);
            // 应该使用空数组作为标签
            expect(mocks.mockAIService.generateSimilarQuestion).toHaveBeenCalledWith(
                expect.any(String),
                [], // 空数组
                'zh',
                'medium'
            );
        });

        it('应该处理空的知识点', async () => {
            const errorItemWithNoTags = {
                ...mockErrorItem,
                knowledgePoints: null,
            };
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(errorItemWithNoTags);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);

            expect(response.status).toBe(200);
        });

        it('应该强制返回数学学科（MVP 锁定）', async () => {
            const errorItemWithPhysics = {
                ...mockErrorItem,
                subject: { id: 'physics', name: '物理' },
            };
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(errorItemWithPhysics);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '物理题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
                subject: undefined, // AI 返回的可能没有学科
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.subject).toBe('数学');
        });

        it('应该在未知学科下仍返回数学学科（MVP 锁定）', async () => {
            const errorItemWithUnknownSubject = {
                ...mockErrorItem,
                subject: { id: 'unknown', name: '未知学科' },
            };
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(errorItemWithUnknownSubject);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.subject).toBe('数学');
        });

        it('应该在缺失学科关联时仍返回数学学科（MVP 锁定）', async () => {
            const errorItemWithNoSubject = {
                ...mockErrorItem,
                subject: null,
            };
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(errorItemWithNoSubject);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '题目',
                answerText: '答案',
                analysis: '解析',
                knowledgePoints: [],
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.subject).toBe('数学');
        });

        it('应该在 gating 失败后重试并成功', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue({
                ...mockErrorItem,
                diagnosisJson: {
                    finalCause: '移项变号错误',
                    candidates: [],
                },
            });

            mocks.mockExtractDiagnosisCause.mockReturnValue('移项变号错误');
            mocks.mockAIService.generateSimilarQuestion
                .mockResolvedValueOnce({
                    questionText: '求解 3x + 1 = 10',
                    answerText: 'x = 2',
                    analysis: '第一次生成',
                    knowledgePoints: ['一元一次方程'],
                    subject: '数学',
                })
                .mockResolvedValueOnce({
                    questionText: '求解 4x - 4 = 12',
                    answerText: 'x = 4',
                    analysis: '第二次生成',
                    knowledgePoints: ['一元一次方程'],
                    subject: '数学',
                });

            mocks.mockBuildCheckerJson
                .mockReturnValueOnce({
                    engine: 'rule_v1',
                    type: 'linear_equation',
                    checkable: true,
                    standard_answer: '3',
                    student_answer: '2',
                    is_correct: false,
                    diff: 'Expected x = 3, got x = 2',
                    key_intermediates: [],
                })
                .mockReturnValueOnce({
                    engine: 'rule_v1',
                    type: 'linear_equation',
                    checkable: true,
                    standard_answer: '4',
                    student_answer: '4',
                    is_correct: true,
                    diff: null,
                    key_intermediates: [],
                });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                    difficulty: 'medium',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.questionText).toBe('求解 4x - 4 = 12');
            expect(mocks.mockAIService.generateSimilarQuestion).toHaveBeenCalledTimes(2);
            expect(mocks.mockAIService.generateSimilarQuestion).toHaveBeenNthCalledWith(
                1,
                expect.stringContaining('Focus mistake cause: 移项变号错误'),
                expect.arrayContaining(['focus_cause:移项变号错误']),
                'zh',
                'medium'
            );
        });

        it('应该在超过最大重试次数后返回 422', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            mocks.mockAIService.generateSimilarQuestion.mockResolvedValue({
                questionText: '求解 2x + 1 = 7',
                answerText: 'x = 2',
                analysis: '解析',
                knowledgePoints: ['一元一次方程'],
                subject: '数学',
            });
            mocks.mockBuildCheckerJson.mockReturnValue({
                engine: 'rule_v1',
                type: 'unknown',
                checkable: false,
                standard_answer: null,
                student_answer: null,
                is_correct: null,
                diff: 'Unsupported pattern',
                key_intermediates: [],
            });

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(422);
            expect(data.message).toBe('PRACTICE_GATING_FAILED');
            expect(mocks.mockAIService.generateSimilarQuestion).toHaveBeenCalledTimes(3);
            expect(data.details?.maxAttempts).toBe(3);
        });

        it('应该处理 AI 服务错误', async () => {
            mocks.mockPrismaErrorItem.findUnique.mockResolvedValue(mockErrorItem);
            mocks.mockAIService.generateSimilarQuestion.mockRejectedValue(
                new Error('AI service unavailable')
            );

            const request = new Request('http://localhost/api/practice/generate', {
                method: 'POST',
                body: JSON.stringify({
                    errorItemId: 'error-item-1',
                    language: 'zh',
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await GENERATE_POST(request);
            const data = await response.json();

            expect(response.status).toBe(503);
            expect(data.message).toBe('AI_SERVICE_UNAVAILABLE');
        });
    });

    describe('POST /api/practice/record (记录练习结果)', () => {
        it('应该成功记录正确的练习结果', async () => {
            const createdRecord = {
                id: 'record-1',
                userId: 'user-123',
                subject: '数学',
                difficulty: 'medium',
                isCorrect: true,
                createdAt: new Date(),
            };
            mocks.mockPrismaPracticeRecord.create.mockResolvedValue(createdRecord);

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '数学',
                    difficulty: 'medium',
                    isCorrect: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.subject).toBe('数学');
            expect(data.isCorrect).toBe(true);
        });

        it('应该成功记录错误的练习结果', async () => {
            const createdRecord = {
                id: 'record-2',
                userId: 'user-123',
                subject: '英语',
                difficulty: 'hard',
                isCorrect: false,
                createdAt: new Date(),
            };
            mocks.mockPrismaPracticeRecord.create.mockResolvedValue(createdRecord);

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '英语',
                    difficulty: 'hard',
                    isCorrect: false,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.isCorrect).toBe(false);
        });

        it('应该记录不同学科的练习结果', async () => {
            const subjects = ['数学', '物理', '化学', '英语', '语文'];

            for (const subject of subjects) {
                mocks.mockPrismaPracticeRecord.create.mockResolvedValue({
                    id: `record-${subject}`,
                    userId: 'user-123',
                    subject,
                    difficulty: 'medium',
                    isCorrect: true,
                });

                const request = new Request('http://localhost/api/practice/record', {
                    method: 'POST',
                    body: JSON.stringify({
                        subject,
                        difficulty: 'medium',
                        isCorrect: true,
                    }),
                    headers: { 'Content-Type': 'application/json' },
                });

                const response = await RECORD_POST(request);
                expect(response.status).toBe(200);
            }
        });

        it('应该拒绝未登录用户', async () => {
            vi.mocked(getServerSession).mockResolvedValue(null);

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '数学',
                    difficulty: 'medium',
                    isCorrect: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.message).toBe('Unauthorized');
        });

        it('应该拒绝 session 中没有 user 的请求', async () => {
            vi.mocked(getServerSession).mockResolvedValue({
                user: undefined,
                expires: '2025-12-31',
            } as any);

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '数学',
                    difficulty: 'medium',
                    isCorrect: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.message).toBe('Unauthorized');
        });

        it('应该处理数据库错误', async () => {
            mocks.mockPrismaPracticeRecord.create.mockRejectedValue(
                new Error('Database connection failed')
            );

            const request = new Request('http://localhost/api/practice/record', {
                method: 'POST',
                body: JSON.stringify({
                    subject: '数学',
                    difficulty: 'medium',
                    isCorrect: true,
                }),
                headers: { 'Content-Type': 'application/json' },
            });

            const response = await RECORD_POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBe('Failed to save record');
        });
    });
});
