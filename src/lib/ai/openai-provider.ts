import OpenAI from "openai";
import { AIService, ParsedQuestion, DifficultyLevel, AIConfig, ImageExtractResult, TextReasonResult } from "./types";
import {
    generateExtractPrompt,
    generateReasonPrompt,
    generateSimilarQuestionPrompt,
} from './prompts';
import { getAppConfig } from '../config';
import { safeParseImageExtract, safeParseParsedQuestion, safeParseTextReason } from './schema';
import { getMathTagsFromDB } from './tag-service';
import { createLogger } from '../logger';

const logger = createLogger('ai:openai');

export class OpenAIProvider implements AIService {
    private openai: OpenAI;
    private model: string;
    private baseURL: string;

    constructor(config?: AIConfig) {
        const apiKey = config?.apiKey;
        const baseURL = config?.baseUrl;

        if (!apiKey) {
            throw new Error("AI_AUTH_ERROR: OPENAI_API_KEY is required for OpenAI provider");
        }

        this.openai = new OpenAI({
            apiKey,
            baseURL: baseURL || undefined,
            defaultHeaders: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });

        this.model = config?.model || 'gpt-4o';
        this.baseURL = baseURL || 'https://api.openai.com/v1';

        logger.info({
            provider: 'OpenAI',
            model: this.model,
            baseURL: this.baseURL,
            apiKeyPrefix: apiKey.substring(0, 8) + '...'
        }, 'AI Provider initialized');
    }

    private extractTag(text: string, tagName: string): string | null {
        const startTag = `<${tagName}>`;
        const endTag = `</${tagName}>`;
        const startIndex = text.indexOf(startTag);

        if (startIndex === -1) {
            return null;
        }

        const contentStartIndex = startIndex + startTag.length;
        const endIndex = text.lastIndexOf(endTag);

        if (endIndex === -1 && tagName === 'analysis') {
            return text.substring(contentStartIndex).trim();
        }

        if (endIndex === -1 || contentStartIndex >= endIndex) {
            return null;
        }

        return text.substring(contentStartIndex, endIndex).trim();
    }

    private parseStepList(raw: string | null): string[] {
        if (!raw) return [];
        return raw
            .split(/\r?\n|\|\|/)
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
    }

    private parseOptionalInt(raw: string | null): number | null {
        if (!raw) return null;
        const num = Number.parseInt(raw.trim(), 10);
        return Number.isNaN(num) ? null : num;
    }

    private parseKnowledgePoints(raw: string | null): string[] {
        if (!raw) return [];
        return raw
            .split(/[，,\n]/)
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .slice(0, 5);
    }

    private parseExtractResponse(text: string): ImageExtractResult {
        const questionText = this.extractTag(text, "question_text");
        const requiresImageRaw = this.extractTag(text, "requires_image");
        const studentStepsRaw = this.extractTag(text, "student_steps_raw");

        const candidate: ImageExtractResult = {
            subject: '数学',
            questionText: questionText || '',
            requiresImage: requiresImageRaw?.toLowerCase().trim() === 'true',
            studentStepsRaw: this.parseStepList(studentStepsRaw),
        };

        const validation = safeParseImageExtract(candidate);
        if (!validation.success) {
            throw new Error("AI_RESPONSE_ERROR: Invalid stage1 extract response");
        }

        return validation.data;
    }

    private parseReasonResponse(text: string): TextReasonResult {
        const answerText = this.extractTag(text, "answer_text");
        const analysis = this.extractTag(text, "analysis");
        const knowledgePointsRaw = this.extractTag(text, "knowledge_points");
        const solutionFinalAnswerRaw = this.extractTag(text, "solution_final_answer");
        const solutionStepsRaw = this.extractTag(text, "solution_steps");
        const mistakeStudentStepsRaw = this.extractTag(text, "mistake_student_steps");
        const mistakeWrongStepIndexRaw = this.extractTag(text, "mistake_wrong_step_index");
        const mistakeWhyWrongRaw = this.extractTag(text, "mistake_why_wrong");
        const mistakeFixSuggestionRaw = this.extractTag(text, "mistake_fix_suggestion");

        const candidate: TextReasonResult = {
            answerText: answerText || '',
            analysis: analysis || '',
            knowledgePoints: this.parseKnowledgePoints(knowledgePointsRaw),
            solutionFinalAnswer: solutionFinalAnswerRaw?.trim() || undefined,
            solutionSteps: this.parseStepList(solutionStepsRaw),
            mistakeStudentSteps: this.parseStepList(mistakeStudentStepsRaw),
            mistakeWrongStepIndex: this.parseOptionalInt(mistakeWrongStepIndexRaw),
            mistakeWhyWrong: mistakeWhyWrongRaw?.trim() || undefined,
            mistakeFixSuggestion: mistakeFixSuggestionRaw?.trim() || undefined,
        };

        const validation = safeParseTextReason(candidate);
        if (!validation.success) {
            throw new Error("AI_RESPONSE_ERROR: Invalid stage2 reason response");
        }

        return validation.data;
    }

    // Kept for backward compatibility with older tests and non-analyze paths.
    private parseResponse(text: string): ParsedQuestion {
        const questionText = this.extractTag(text, "question_text") || '';
        const answerText = this.extractTag(text, "answer_text") || '';
        const analysis = this.extractTag(text, "analysis") || '';
        const knowledgePoints = this.parseKnowledgePoints(this.extractTag(text, "knowledge_points"));
        const requiresImage = this.extractTag(text, "requires_image")?.toLowerCase().trim() === 'true';

        return {
            questionText,
            answerText,
            analysis,
            subject: '数学',
            knowledgePoints,
            requiresImage,
            solutionFinalAnswer: this.extractTag(text, "solution_final_answer") || undefined,
            solutionSteps: this.parseStepList(this.extractTag(text, "solution_steps")),
            mistakeStudentSteps: this.parseStepList(this.extractTag(text, "mistake_student_steps")),
            mistakeWrongStepIndex: this.parseOptionalInt(this.extractTag(text, "mistake_wrong_step_index")),
            mistakeWhyWrong: this.extractTag(text, "mistake_why_wrong") || undefined,
            mistakeFixSuggestion: this.extractTag(text, "mistake_fix_suggestion") || undefined,
        };
    }

    private getStageModels() {
        const config = getAppConfig();
        const active = config.openai?.instances?.find((it) => it.id === config.openai?.activeInstanceId)
            || config.openai?.instances?.[0];

        return {
            stage1: active?.extractModel || active?.model || this.model,
            stage2: active?.reasonModel || active?.model || this.model,
        };
    }

    private getTokenLimits() {
        const config = getAppConfig();
        return {
            stage1: config.ai?.analyzeStage1MaxTokens || 1200,
            stage2: config.ai?.analyzeStage2MaxTokens || 3200,
        };
    }

    async analyzeImage(
        imageBase64: string,
        mimeType: string = "image/jpeg",
        language: 'zh' | 'en' = 'zh',
        grade?: 7 | 8 | 9 | 10 | 11 | 12 | null,
        _subject?: string | null
    ): Promise<ParsedQuestion> {
        const stageStart = Date.now();
        const models = this.getStageModels();
        const limits = this.getTokenLimits();

        const extractPrompt = generateExtractPrompt(language);

        logger.info({
            provider: 'OpenAI',
            stage: 'extract',
            model: models.stage1,
            maxTokens: limits.stage1,
            imageBytes: imageBase64.length,
        }, 'Analyze stage1 start');

        const extractResponse = await this.openai.chat.completions.create({
            model: models.stage1,
            messages: [
                {
                    role: "system",
                    content: extractPrompt,
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType};base64,${imageBase64}`,
                            },
                        },
                    ],
                },
            ],
            max_tokens: limits.stage1,
        });

        const extractText = extractResponse.choices?.[0]?.message?.content || "";
        if (!extractText) {
            throw new Error("AI_RESPONSE_ERROR: Empty stage1 response");
        }

        const extract = this.parseExtractResponse(extractText);

        logger.info({
            provider: 'OpenAI',
            stage: 'extract',
            durationMs: Date.now() - stageStart,
            responseChars: extractText.length,
            questionChars: extract.questionText.length,
            studentSteps: extract.studentStepsRaw.length,
        }, 'Analyze stage1 done');

        const prefetchedMathTags = await getMathTagsFromDB(grade || null);
        const reasonPrompt = generateReasonPrompt(
            language,
            extract.questionText,
            extract.studentStepsRaw,
            grade,
            {
                customTemplate: getAppConfig().prompts?.analyze,
                prefetchedMathTags,
            }
        );

        const reasonStart = Date.now();
        logger.info({
            provider: 'OpenAI',
            stage: 'reason',
            model: models.stage2,
            maxTokens: limits.stage2,
        }, 'Analyze stage2 start');

        const reasonResponse = await this.openai.chat.completions.create({
            model: models.stage2,
            messages: [
                {
                    role: "system",
                    content: reasonPrompt,
                },
                {
                    role: "user",
                    content: "Return only the required XML-like tags.",
                },
            ],
            max_tokens: limits.stage2,
        });

        const reasonText = reasonResponse.choices?.[0]?.message?.content || "";
        if (!reasonText) {
            throw new Error("AI_RESPONSE_ERROR: Empty stage2 response");
        }

        const reason = this.parseReasonResponse(reasonText);

        logger.info({
            provider: 'OpenAI',
            stage: 'reason',
            durationMs: Date.now() - reasonStart,
            responseChars: reasonText.length,
            knowledgePoints: reason.knowledgePoints.length,
        }, 'Analyze stage2 done');

        const merged: ParsedQuestion = {
            questionText: extract.questionText,
            answerText: reason.answerText,
            analysis: reason.analysis,
            subject: '数学',
            knowledgePoints: reason.knowledgePoints,
            requiresImage: extract.requiresImage,
            solutionFinalAnswer: reason.solutionFinalAnswer,
            solutionSteps: reason.solutionSteps,
            mistakeStudentSteps: reason.mistakeStudentSteps?.length
                ? reason.mistakeStudentSteps
                : extract.studentStepsRaw,
            mistakeWrongStepIndex: reason.mistakeWrongStepIndex,
            mistakeWhyWrong: reason.mistakeWhyWrong,
            mistakeFixSuggestion: reason.mistakeFixSuggestion,
        };

        const validation = safeParseParsedQuestion(merged);
        if (validation.success) {
            logger.info({ durationMs: Date.now() - stageStart }, 'Analyze two-stage done');
            return validation.data;
        }

        logger.warn({ issues: validation.error.issues }, 'Merged analyze response schema warning');
        return merged;
    }

    async generateSimilarQuestion(
        originalQuestion: string,
        knowledgePoints: string[],
        language: 'zh' | 'en' = 'zh',
        difficulty: DifficultyLevel = 'medium'
    ): Promise<ParsedQuestion> {
        const config = getAppConfig();
        const systemPrompt = generateSimilarQuestionPrompt(language, originalQuestion, knowledgePoints, difficulty, {
            customTemplate: config.prompts?.similar
        });
        const userPrompt = `\nOriginal Question: "${originalQuestion}"\nKnowledge Points: ${knowledgePoints.join(", ")}\n`;

        try {
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                max_tokens: 4096,
            });

            const text = response.choices?.[0]?.message?.content || "";
            if (!text) throw new Error("Empty response from AI");

            return this.parseResponse(text);
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }

    async reanswerQuestion(
        questionText: string,
        language: 'zh' | 'en' = 'zh',
        subject?: string | null,
        imageBase64?: string
    ): Promise<{ answerText: string; analysis: string; knowledgePoints: string[] }> {
        const { generateReanswerPrompt } = await import('./prompts');
        const prompt = generateReanswerPrompt(language, questionText, subject);

        try {
            let userContent: any = "Please provide answer and analysis based on the question.";
            if (imageBase64) {
                const imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
                userContent = [
                    { type: "text", text: "Use both image and question to answer." },
                    { type: "image_url", image_url: { url: imageUrl } }
                ];
            }

            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    { role: "system", content: prompt },
                    { role: "user", content: userContent }
                ],
                max_tokens: 4096,
            });

            const text = response.choices?.[0]?.message?.content || "";
            if (!text) throw new Error("Empty response from AI");

            const answerText = this.extractTag(text, "answer_text") || "";
            const analysis = this.extractTag(text, "analysis") || "";
            const knowledgePoints = this.parseKnowledgePoints(this.extractTag(text, "knowledge_points"));

            return { answerText, analysis, knowledgePoints };
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }

    private handleError(error: unknown) {
        logger.error({ error }, 'OpenAI error');
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            if (msg.includes('fetch failed') || msg.includes('network') || msg.includes('connect')) {
                throw new Error("AI_CONNECTION_FAILED");
            }
            if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted') || msg.includes('408')) {
                throw new Error("AI_TIMEOUT_ERROR");
            }
            if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('429') || msg.includes('too many') || msg.includes('exceeded retry limit')) {
                throw new Error("AI_QUOTA_EXCEEDED");
            }
            if (msg.includes('403') || msg.includes('forbidden') || msg.includes('permission')) {
                throw new Error("AI_PERMISSION_DENIED");
            }
            if (msg.includes('404') || msg.includes('not found') || msg.includes('does not exist')) {
                throw new Error("AI_NOT_FOUND");
            }
            if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('overloaded') || msg.includes('unavailable')) {
                throw new Error("AI_SERVICE_UNAVAILABLE");
            }
            if (msg.includes('invalid json') || msg.includes('parse')) {
                throw new Error("AI_RESPONSE_ERROR");
            }
            if (msg.includes('api key') || msg.includes('unauthorized') || msg.includes('401')) {
                throw new Error("AI_AUTH_ERROR");
            }
        }
        throw new Error("AI_UNKNOWN_ERROR");
    }
}