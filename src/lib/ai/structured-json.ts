import { z } from "zod";

const structuredStageValues = ["primary", "junior_high"] as const;

const StructuredProblemSchema = z.object({
    problem: z.object({
        stage: z.enum(structuredStageValues),
        topic: z.string().min(1),
        question_markdown: z.string().min(1),
        given: z.array(z.string()),
        ask: z.string().min(1),
    }),
});

const StructuredStudentSchema = z.object({
    student: z.object({
        final_answer_markdown: z.string().min(1),
        steps: z.array(z.string()),
    }),
});

const StructuredKnowledgeTagSchema = z.object({
    name: z.string().min(1),
    evidence: z.string().default(""),
    confidence: z.number().min(0).max(1).default(0.5),
});

const StructuredLegacySchema = StructuredProblemSchema.merge(StructuredStudentSchema);

export const StructuredQuestionJsonSchema = z.object({
    version: z.literal("v2"),
    problem: StructuredProblemSchema.shape.problem,
    student: StructuredStudentSchema.shape.student,
    knowledge: z.object({
        tags: z.array(StructuredKnowledgeTagSchema),
    }),
    solution: z.object({
        finalAnswer: z.string().min(1),
        steps: z.array(z.string()),
    }),
    mistake: z.object({
        studentSteps: z.array(z.string()),
        studentAnswer: z.string().nullable().default(null),
        wrongStepIndex: z.number().int().nullable().default(null),
        whyWrong: z.string().default(""),
        fixSuggestion: z.string().default(""),
    }),
    rootCause: z.object({
        studentHypothesis: z.string().default(""),
        confirmedCause: z.string().default(""),
        chatSummary: z.string().default(""),
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

function toV2StructuredJson(input: {
    problem: z.infer<typeof StructuredProblemSchema>["problem"];
    student: z.infer<typeof StructuredStudentSchema>["student"];
}): StructuredQuestionJson | null {
    const steps = input.student.steps.slice(0, 8);
    const candidate = {
        version: "v2" as const,
        problem: input.problem,
        student: input.student,
        knowledge: {
            tags: [],
        },
        solution: {
            finalAnswer: input.student.final_answer_markdown,
            steps,
        },
        mistake: {
            studentSteps: steps,
            studentAnswer: null,
            wrongStepIndex: null,
            whyWrong: "",
            fixSuggestion: "",
        },
        rootCause: {
            studentHypothesis: "",
            confirmedCause: "",
            chatSummary: "",
        },
    };

    const parsed = StructuredQuestionJsonSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
}

export function buildStructuredQuestionJson(source: StructuredSource): StructuredQuestionJson | null {
    const questionText = source.questionText?.trim() || "";
    const answerText = source.answerText?.trim() || "";
    const analysis = source.analysis?.trim() || "";

    if (!questionText || !answerText) {
        return null;
    }

    return toV2StructuredJson({
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
    });
}

export function normalizeStructuredQuestionJson(value: unknown): StructuredQuestionJson | null {
    const v2Parsed = StructuredQuestionJsonSchema.safeParse(value);
    if (v2Parsed.success) {
        return v2Parsed.data;
    }

    const legacyParsed = StructuredLegacySchema.safeParse(value);
    if (!legacyParsed.success) {
        return null;
    }

    return toV2StructuredJson({
        problem: legacyParsed.data.problem,
        student: legacyParsed.data.student,
    });
}
