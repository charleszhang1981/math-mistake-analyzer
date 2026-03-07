import { describe, expect, it } from 'vitest';
import { generateExtractPrompt, generateReasonPrompt } from '@/lib/ai/prompts';

describe('two-stage prompts', () => {
    it('generateExtractPrompt should only request extraction tags', () => {
        const prompt = generateExtractPrompt('zh');

        expect(prompt).toContain('<question_text>');
        expect(prompt).toContain('<requires_image>');
        expect(prompt).toContain('<student_steps_raw>');
        expect(prompt).not.toContain('<answer_text>');
        expect(prompt).not.toContain('<analysis>');
        expect(prompt).not.toContain('<subject>');
    });

    it('generateReasonPrompt should include structured outputs and short-analysis rule', () => {
        const prompt = generateReasonPrompt(
            'zh',
            '已知 2x + 3 = 7，求 x',
            ['2x + 3 = 7', '2x = 4', 'x = 2'],
            7,
            {
                prefetchedMathTags: ['一元一次方程', '移项'],
            }
        );

        expect(prompt).toContain('<answer_text>');
        expect(prompt).toContain('<analysis>');
        expect(prompt).toContain('<solution_steps>');
        expect(prompt).toContain('<mistake_wrong_step_index>');
        expect(prompt).toContain('short teaching summary');
        expect(prompt).toContain('Usually use 4-6 steps.');
        expect(prompt).toContain('Avoid outline-only wording.');
        expect(prompt).toContain('Bad example for <solution_steps>:');
        expect(prompt).toContain('Good example for <solution_steps>:');
        expect(prompt).toContain('"一元一次方程"');
        expect(prompt).toContain('"移项"');
    });
});
