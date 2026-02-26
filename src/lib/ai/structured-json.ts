import { z } from "zod";

const structuredStageValues = ["primary", "junior_high"] as const;

export const StructuredQuestionJsonSchema = z.object({
    problem: z.object({
        stage: z.enum(structuredStageValues),
        topic: z.string().min(1),
        question_markdown: z.string().min(1),
        given: z.array(z.string()),
        ask: z.string().min(1),
    }),
    student: z.object({
        final_answer_markdown: z.string().min(1),
        steps: z.array(z.string()),
    }),
});

export type StructuredQuestionJson = z.infer<typeof StructuredQuestionJsonSchema>;

const stepPrefixPattern = /^(\d+[\.\)]\s*|[-*]\s*)/;

function toNormalizedLines(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.replace(stepPrefixPattern, "").trim())
        .filter((line) => line.length > 0);
}

function toSentenceSteps(text: string): string[] {
    return text
        .split(/[。！？.!?]\s*/)
        .map((segment) => segment.replace(stepPrefixPattern, "").trim())
        .filter((segment) => segment.length > 0);
}

function inferStage(questionText: string): "primary" | "junior_high" {
    const primaryPattern = /(小学|小明|小红|鸡兔同笼|加法|减法|乘法|除法)/;
    return primaryPattern.test(questionText) ? "primary" : "junior_high";
}

function inferTopic(questionText: string): string {
    const lower = questionText.toLowerCase();

    if (/方程|equation/.test(questionText)) return "equation";
    if (/分数|fraction/.test(questionText)) return "fraction";
    if (/比例|ratio|percent|百分/.test(questionText)) return "ratio";
    if (/几何|geometry|三角形|圆/.test(questionText)) return "geometry";
    if (/函数|function/.test(questionText)) return "function";
    if (/代数|algebra/.test(questionText)) return "algebra";
    if (/应用题|word problem/.test(questionText) || lower.includes("solve")) return "word_problem";

    return "unknown";
}

function inferAsk(questionText: string): string {
    const normalized = questionText.trim();
    if (!normalized) return "";

    const firstLine = normalized.split(/\r?\n/).find((line) => line.trim().length > 0);
    return (firstLine || normalized).trim();
}

function extractSteps(analysis: string): string[] {
    const normalized = analysis.trim();
    if (!normalized) return [];

    const lines = toNormalizedLines(normalized);
    if (lines.length > 1) {
        return lines.slice(0, 8);
    }

    const sentenceSteps = toSentenceSteps(normalized);
    if (sentenceSteps.length > 0) {
        return sentenceSteps.slice(0, 8);
    }

    return [normalized];
}

export interface StructuredSource {
    questionText?: string | null;
    answerText?: string | null;
    analysis?: string | null;
}

export function buildStructuredQuestionJson(source: StructuredSource): StructuredQuestionJson | null {
    const questionText = source.questionText?.trim() || "";
    const answerText = source.answerText?.trim() || "";
    const analysis = source.analysis?.trim() || "";

    if (!questionText || !answerText) {
        return null;
    }

    const candidate = {
        problem: {
            stage: inferStage(questionText),
            topic: inferTopic(questionText),
            question_markdown: questionText,
            given: [],
            ask: inferAsk(questionText),
        },
        student: {
            final_answer_markdown: answerText,
            steps: extractSteps(analysis),
        },
    };

    const parsed = StructuredQuestionJsonSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
}

export function normalizeStructuredQuestionJson(value: unknown): StructuredQuestionJson | null {
    const parsed = StructuredQuestionJsonSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
