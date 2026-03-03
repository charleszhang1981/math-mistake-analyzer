import { describe, expect, it } from 'vitest';
import { safeParseImageExtract, safeParseTextReason } from '@/lib/ai/schema';

describe('two-stage schema', () => {
    it('validates stage1 extract payload', () => {
        const result = safeParseImageExtract({
            subject: '数学',
            requiresImage: false,
            questionText: '求解：2x + 3 = 7',
            studentStepsRaw: ['2x + 3 = 7', '2x = 4', 'x = 2'],
        });

        expect(result.success).toBe(true);
        if (!result.success) {
            throw new Error('unexpected parse failure');
        }

        expect(result.data.subject).toBe('数学');
        expect(result.data.fontSizeHint).toBe('normal');
        expect(result.data.studentStepsRaw).toHaveLength(3);
    });

    it('validates stage2 reason payload with optional G/H fields', () => {
        const result = safeParseTextReason({
            answerText: 'x = 2',
            analysis: '先移项，再两边同除以 2。',
            knowledgePoints: ['一元一次方程', '移项'],
            solutionFinalAnswer: 'x = 2',
            solutionSteps: ['2x + 3 = 7', '2x = 4', 'x = 2'],
            mistakeStudentSteps: ['2x + 3 = 7', 'x = 2'],
            mistakeWrongStepIndex: 2,
            mistakeWhyWrong: '中间步骤缺失，等式变形不完整。',
            mistakeFixSuggestion: '先写出 2x = 4 再求 x。',
        });

        expect(result.success).toBe(true);
        if (!result.success) {
            throw new Error('unexpected parse failure');
        }

        expect(result.data.solutionSteps?.length).toBeGreaterThan(0);
        expect(result.data.mistakeWrongStepIndex).toBe(2);
    });
});
