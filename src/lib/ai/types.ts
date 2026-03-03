// Re-export Zod-validated types from schema.ts
export type {
    ParsedQuestionFromSchema as ParsedQuestion,
    ImageExtractFromSchema as ImageExtractResult,
    TextReasonFromSchema as TextReasonResult,
} from './schema';

import type { ParsedQuestionFromSchema } from './schema';

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'harder';

export interface SimilarQuestionContext {
    gradeSemester?: string | null;
    mistakeWhyWrong?: string | null;
    confirmedRootCause?: string | null;
}

export interface ReanswerResult {
    answerText: string;
    analysis: string;
    knowledgePoints: string[];
    solutionFinalAnswer?: string;
    solutionSteps?: string[];
    mistakeStudentSteps?: string[];
    mistakeWrongStepIndex?: number | null;
    mistakeWhyWrong?: string;
    mistakeFixSuggestion?: string;
}

export interface AIService {
    analyzeImage(
        imageBase64: string,
        mimeType?: string,
        language?: 'zh' | 'en',
        grade?: 7 | 8 | 9 | 10 | 11 | 12 | null,
        subject?: string | null
    ): Promise<ParsedQuestionFromSchema>;
    generateSimilarQuestion(
        originalQuestion: string,
        knowledgePoints: string[],
        language?: 'zh' | 'en',
        difficulty?: DifficultyLevel,
        context?: SimilarQuestionContext
    ): Promise<ParsedQuestionFromSchema>;
    reanswerQuestion(
        questionText: string,
        language?: 'zh' | 'en',
        subject?: string | null,
        imageBase64?: string
    ): Promise<ReanswerResult>;
}

export interface AIConfig {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    // Azure-specific fields
    azureDeployment?: string;
    azureApiVersion?: string;
}
