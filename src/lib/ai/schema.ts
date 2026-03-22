import { z } from 'zod';

const SubjectSchema = z.enum([
    "数学", "物理", "化学", "生物",
    "英语", "语文", "历史", "地理",
    "政治", "其他",
]);

/**
 * Stage 1 output: vision extraction only.
 * Subject is locked to math by product policy.
 */
export const ImageExtractSchema = z.object({
    subject: z.literal("数学").default("数学"),
    requiresImage: z.boolean().optional().default(false),
    questionText: z.string().min(1, "questionText cannot be empty"),
    studentStepsRaw: z.array(z.string().min(1)).optional().default([]),
});

/**
 * Stage 2 output: text reasoning + structured G/H fields.
 */
export const TextReasonSchema = z.object({
    answerText: z.string().min(1, "answerText cannot be empty"),
    analysis: z.string().min(1, "analysis cannot be empty"),
    knowledgePoints: z.array(z.string().min(1)).max(5, "knowledgePoints max length is 5").default([]),
    solutionFinalAnswer: z.string().optional(),
    solutionSteps: z.array(z.string().min(1)).optional(),
    mistakeStudentSteps: z.array(z.string().min(1)).optional(),
    mistakeWrongStepIndex: z.number().int().nullable().optional(),
    mistakeWhyWrong: z.string().optional(),
    mistakeFixSuggestion: z.string().optional(),
});

/**
 * Final merged response used by public APIs and UI.
 */
export const ParsedQuestionSchema = z.object({
    questionText: z.string().min(1, "questionText cannot be empty"),
    answerText: z.string().min(1, "answerText cannot be empty"),
    analysis: z.string().min(1, "analysis cannot be empty"),
    subject: SubjectSchema,
    knowledgePoints: z.array(z.string()).max(5, "knowledgePoints max length is 5"),
    requiresImage: z.boolean().optional().default(false),
    solutionFinalAnswer: z.string().optional(),
    solutionSteps: z.array(z.string()).optional(),
    mistakeStudentSteps: z.array(z.string()).optional(),
    mistakeWrongStepIndex: z.number().int().nullable().optional(),
    mistakeWhyWrong: z.string().optional(),
    mistakeFixSuggestion: z.string().optional(),
});

export type ImageExtractFromSchema = z.infer<typeof ImageExtractSchema>;
export type TextReasonFromSchema = z.infer<typeof TextReasonSchema>;
export type ParsedQuestionFromSchema = z.infer<typeof ParsedQuestionSchema>;

export function validateImageExtract(data: unknown): ImageExtractFromSchema {
    return ImageExtractSchema.parse(data);
}

export function safeParseImageExtract(data: unknown) {
    return ImageExtractSchema.safeParse(data);
}

export function validateTextReason(data: unknown): TextReasonFromSchema {
    return TextReasonSchema.parse(data);
}

export function safeParseTextReason(data: unknown) {
    return TextReasonSchema.safeParse(data);
}

export function validateParsedQuestion(data: unknown): ParsedQuestionFromSchema {
    return ParsedQuestionSchema.parse(data);
}

export function safeParseParsedQuestion(data: unknown) {
    return ParsedQuestionSchema.safeParse(data);
}
