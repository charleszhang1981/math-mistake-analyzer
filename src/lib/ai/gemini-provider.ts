import { GoogleGenAI } from "@google/genai";
import { AIService, ParsedQuestion, DifficultyLevel, AIConfig, ImageExtractResult, TextReasonResult, ReanswerResult, SimilarQuestionContext } from "./types";
import {
    generateExtractPrompt,
    generateReasonPrompt,
    generateReanswerPrompt,
    generateSimilarQuestionPrompt,
} from './prompts';
import { safeParseImageExtract, safeParseParsedQuestion, safeParseTextReason } from './schema';
import { getAppConfig } from '../config';
import { getMathTagsFromDB } from './tag-service';
import { createLogger } from '../logger';

const logger = createLogger('ai:gemini');

export class GeminiProvider implements AIService {
    private ai: GoogleGenAI;
    private modelName: string;
    private baseUrl: string;

    constructor(config?: AIConfig) {
        const apiKey = config?.apiKey;
        const baseUrl = config?.baseUrl;

        if (!apiKey) {
            throw new Error("AI_AUTH_ERROR: GOOGLE_API_KEY is required for Gemini provider");
        }

        this.ai = new GoogleGenAI({
            apiKey,
            httpOptions: baseUrl ? { baseUrl } : undefined,
        });

        this.modelName = config?.model || 'gemini-2.5-flash';
        this.baseUrl = baseUrl || 'https://generativelanguage.googleapis.com';

        logger.info({
            provider: 'Gemini',
            model: this.modelName,
            baseUrl: this.baseUrl,
            apiKeyPrefix: apiKey.substring(0, 8) + '...'
        }, 'AI Provider initialized');
    }

    private async retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 3): Promise<T> {
        let lastError: unknown;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                const msg = error instanceof Error ? error.message.toLowerCase() : String(error);

                const isRetryable =
                    msg.includes('fetch failed') ||
                    msg.includes('network') ||
                    msg.includes('connect') ||
                    msg.includes('503') ||
                    msg.includes('502') ||
                    msg.includes('504') ||
                    msg.includes('overloaded') ||
                    msg.includes('timeout') ||
                    msg.includes('etimedout') ||
                    msg.includes('enotfound') ||
                    msg.includes('econnreset') ||
                    msg.includes('econnrefused') ||
                    msg.includes('unavailable') ||
                    msg.includes('429') ||
                    msg.includes('rate limit') ||
                    msg.includes('too many') ||
                    msg.includes('exceeded retry limit');

                if (!isRetryable || attempt === maxRetries) {
                    throw error;
                }

                const isRateLimit = msg.includes('429') || msg.includes('rate limit') || msg.includes('too many');
                const baseDelay = isRateLimit ? 2000 : 1000;
                const jitter = Math.floor(Math.random() * 300);
                const delay = Math.pow(2, attempt - 1) * baseDelay + jitter;
                logger.warn({ attempt, maxRetries, error: msg, nextRetryDelayMs: delay }, 'Gemini operation failed, retrying');
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    private extractTag(text: string, tagName: string): string | null {
        const startTag = `<${tagName}>`;
        const endTag = `</${tagName}>`;
        const startIndex = text.indexOf(startTag);
        const contentStartIndex = startIndex === -1 ? -1 : startIndex + startTag.length;
        const endIndex = contentStartIndex === -1 ? -1 : text.indexOf(endTag, contentStartIndex);

        if (startIndex === -1 || endIndex === -1 || contentStartIndex >= endIndex) {
            return null;
        }

        return text.substring(contentStartIndex, endIndex).trim();
    }

    private extractTagLoose(text: string, tagName: string, nextTagNames: string[] = []): string | null {
        const startTag = `<${tagName}>`;
        const startIndex = text.indexOf(startTag);
        if (startIndex === -1) return null;

        const contentStartIndex = startIndex + startTag.length;
        const endTag = `</${tagName}>`;
        let endIndex = text.indexOf(endTag, contentStartIndex);
        if (endIndex === -1) {
            endIndex = text.length;
        }

        for (const nextTagName of nextTagNames) {
            const nextStartTag = `<${nextTagName}>`;
            const nextStartIndex = text.indexOf(nextStartTag, contentStartIndex);
            if (nextStartIndex !== -1 && nextStartIndex < endIndex) {
                endIndex = nextStartIndex;
            }
        }

        if (contentStartIndex >= endIndex) return null;
        return text.substring(contentStartIndex, endIndex).trim();
    }

    private sanitizeXmlArtifacts(value: string): string {
        if (!value) return '';
        return value
            .replace(/<\/?[a-zA-Z_][a-zA-Z0-9_]*>/g, '')
            .trim();
    }

    private parseStepList(raw: string | null): string[] {
        if (!raw) return [];
        const lines = raw
            .split(/\r?\n|\|\|/)
            .flatMap((entry) => {
                const cleaned = this.sanitizeXmlArtifacts(entry)
                    .replace(/([。；;])\s*(\d{1,2}[.)](?!\d))/g, "$1\n$2")
                    .replace(/\s+(\d{1,2}[.)](?!\d))/g, "\n$1");
                return cleaned.split(/\n+/);
            })
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);

        const steps: string[] = [];
        for (let i = 0; i < lines.length; i++) {
            const current = lines[i]
                .replace(/^[-*•]\s*/, "")
                .trim();
            if (!current) continue;

            if (/^\d+[\.\)]$/.test(current)) {
                const next = lines[i + 1];
                if (next) {
                    const merged = next
                        .replace(/^[-*•]\s*/, "")
                        .replace(/^\d+[\.\)]\s*/, "")
                        .trim();
                    if (merged) {
                        steps.push(merged);
                        i += 1;
                    }
                }
                continue;
            }

            const normalized = current.replace(/^\d+[\.\)]\s*/, "").trim();
            if (normalized) {
                steps.push(normalized);
            }
        }

        return steps;
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
        const candidate: ImageExtractResult = {
            subject: '数学',
            questionText: this.extractTag(text, 'question_text') || '',
            requiresImage: this.extractTag(text, 'requires_image')?.toLowerCase().trim() === 'true',
            studentStepsRaw: this.parseStepList(this.extractTag(text, 'student_steps_raw')),
        };

        const validation = safeParseImageExtract(candidate);
        if (!validation.success) {
            throw new Error('AI_RESPONSE_ERROR: Invalid stage1 extract response');
        }

        return validation.data;
    }

    private parseReasonResponse(text: string): TextReasonResult {
        const candidate: TextReasonResult = {
            answerText: this.extractTag(text, 'answer_text') || '',
            analysis: this.extractTag(text, 'analysis') || '',
            knowledgePoints: this.parseKnowledgePoints(this.extractTag(text, 'knowledge_points')),
            solutionFinalAnswer: this.extractTag(text, 'solution_final_answer') || undefined,
            solutionSteps: this.parseStepList(this.extractTag(text, 'solution_steps')),
            mistakeStudentSteps: this.parseStepList(this.extractTag(text, 'mistake_student_steps')),
            mistakeWrongStepIndex: this.parseOptionalInt(this.extractTag(text, 'mistake_wrong_step_index')),
            mistakeWhyWrong: this.extractTag(text, 'mistake_why_wrong') || undefined,
            mistakeFixSuggestion: this.extractTag(text, 'mistake_fix_suggestion') || undefined,
        };

        const validation = safeParseTextReason(candidate);
        if (!validation.success) {
            throw new Error('AI_RESPONSE_ERROR: Invalid stage2 reason response');
        }

        return validation.data;
    }

    // Kept for backward compatibility with non-analyze paths.
    private parseResponse(text: string): ParsedQuestion {
        return {
            questionText: this.extractTag(text, 'question_text') || '',
            answerText: this.extractTag(text, 'answer_text') || '',
            analysis: this.extractTag(text, 'analysis') || '',
            subject: '数学',
            knowledgePoints: this.parseKnowledgePoints(this.extractTag(text, 'knowledge_points')),
            requiresImage: this.extractTag(text, 'requires_image')?.toLowerCase().trim() === 'true',
            solutionFinalAnswer: this.extractTag(text, 'solution_final_answer') || undefined,
            solutionSteps: this.parseStepList(this.extractTag(text, 'solution_steps')),
            mistakeStudentSteps: this.parseStepList(this.extractTag(text, 'mistake_student_steps')),
            mistakeWrongStepIndex: this.parseOptionalInt(this.extractTag(text, 'mistake_wrong_step_index')),
            mistakeWhyWrong: this.extractTag(text, 'mistake_why_wrong') || undefined,
            mistakeFixSuggestion: this.extractTag(text, 'mistake_fix_suggestion') || undefined,
        };
    }

    private getStageModels() {
        const config = getAppConfig();
        return {
            stage1: config.gemini?.modelExtract || config.gemini?.model || this.modelName,
            stage2: config.gemini?.modelReason || config.gemini?.model || this.modelName,
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
        subject?: string | null
    ): Promise<ParsedQuestion> {
        void subject;
        const models = this.getStageModels();
        const limits = this.getTokenLimits();
        const flowStart = Date.now();

        const extractPrompt = generateExtractPrompt(language);
        const stage1Start = Date.now();

        logger.info({
            provider: 'Gemini',
            stage: 'extract',
            model: models.stage1,
            maxTokens: limits.stage1,
            imageBytes: imageBase64.length,
        }, 'Analyze stage1 start');

        const stage1Response = await this.retryOperation(() => this.ai.models.generateContent({
            model: models.stage1,
            contents: [
                { text: extractPrompt },
                {
                    inlineData: {
                        data: imageBase64,
                        mimeType,
                    },
                },
            ],
            config: {
                maxOutputTokens: limits.stage1,
            },
        }));

        const stage1Text = stage1Response.text || '';
        if (!stage1Text) {
            throw new Error('AI_RESPONSE_ERROR: Empty stage1 response');
        }

        const extract = this.parseExtractResponse(stage1Text);

        logger.info({
            provider: 'Gemini',
            stage: 'extract',
            durationMs: Date.now() - stage1Start,
            responseChars: stage1Text.length,
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

        const stage2Start = Date.now();

        logger.info({
            provider: 'Gemini',
            stage: 'reason',
            model: models.stage2,
            maxTokens: limits.stage2,
        }, 'Analyze stage2 start');

        const stage2Response = await this.retryOperation(() => this.ai.models.generateContent({
            model: models.stage2,
            contents: reasonPrompt,
            config: {
                maxOutputTokens: limits.stage2,
            },
        }));

        const stage2Text = stage2Response.text || '';
        if (!stage2Text) {
            throw new Error('AI_RESPONSE_ERROR: Empty stage2 response');
        }

        const reason = this.parseReasonResponse(stage2Text);

        logger.info({
            provider: 'Gemini',
            stage: 'reason',
            durationMs: Date.now() - stage2Start,
            responseChars: stage2Text.length,
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
            logger.info({ durationMs: Date.now() - flowStart }, 'Analyze two-stage done');
            return validation.data;
        }

        logger.warn({ issues: validation.error.issues }, 'Merged analyze response schema warning');
        return merged;
    }

    async generateSimilarQuestion(
        originalQuestion: string,
        knowledgePoints: string[],
        language: 'zh' | 'en' = 'zh',
        difficulty: DifficultyLevel = 'medium',
        context?: SimilarQuestionContext
    ): Promise<ParsedQuestion> {
        const config = getAppConfig();
        const models = this.getStageModels();
        const limits = this.getTokenLimits();
        const maxTokens = Math.min(limits.stage2, 900);
        const prompt = generateSimilarQuestionPrompt(language, originalQuestion, knowledgePoints, difficulty, {
            customTemplate: config.prompts?.similar,
        }, context);
        const startedAt = Date.now();

        try {
            const response = await this.retryOperation(() => this.ai.models.generateContent({
                model: models.stage2,
                contents: prompt,
                config: {
                    maxOutputTokens: maxTokens,
                },
            }));

            const text = response.text || '';
            if (!text) throw new Error('Empty response from AI');

            logger.info({
                provider: 'Gemini',
                stage: 'similar',
                model: models.stage2,
                maxTokens,
                durationMs: Date.now() - startedAt,
                responseChars: text.length,
            }, 'Generate similar question done');

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
    ): Promise<ReanswerResult> {
        void subject;
        const models = this.getStageModels();
        const limits = this.getTokenLimits();
        const prompt = generateReanswerPrompt(
            language,
            questionText,
            subject
        );

        try {
            const contents = imageBase64
                ? [
                    { text: prompt },
                    { inlineData: { mimeType: 'image/jpeg', data: imageBase64.replace(/^data:image\/\w+;base64,/, '') } },
                ]
                : prompt;

            const response = await this.retryOperation(() => this.ai.models.generateContent({
                model: models.stage2,
                contents,
                config: {
                    maxOutputTokens: limits.stage2,
                },
            }));

            const text = response.text || '';
            if (!text) throw new Error('Empty response from AI');

            const answerTextRaw =
                this.extractTagLoose(text, 'answer_text', ['analysis', 'knowledge_points'])
                || this.extractTag(text, 'answer_text')
                || '';
            const analysisRaw =
                this.extractTagLoose(text, 'analysis', ['knowledge_points'])
                || this.extractTag(text, 'analysis')
                || '';
            const knowledgePointsRaw =
                this.extractTagLoose(text, 'knowledge_points')
                || this.extractTag(text, 'knowledge_points');
            const solutionFinalAnswerRaw =
                this.extractTagLoose(text, 'solution_final_answer', ['solution_steps', 'mistake_student_steps', 'mistake_wrong_step_index', 'mistake_why_wrong', 'mistake_fix_suggestion'])
                || this.extractTag(text, 'solution_final_answer');
            const solutionStepsRaw =
                this.extractTagLoose(text, 'solution_steps', ['mistake_student_steps', 'mistake_wrong_step_index', 'mistake_why_wrong', 'mistake_fix_suggestion'])
                || this.extractTag(text, 'solution_steps');
            const mistakeStudentStepsRaw =
                this.extractTagLoose(text, 'mistake_student_steps', ['mistake_wrong_step_index', 'mistake_why_wrong', 'mistake_fix_suggestion'])
                || this.extractTag(text, 'mistake_student_steps');
            const mistakeWrongStepIndexRaw =
                this.extractTagLoose(text, 'mistake_wrong_step_index', ['mistake_why_wrong', 'mistake_fix_suggestion'])
                || this.extractTag(text, 'mistake_wrong_step_index');
            const mistakeWhyWrongRaw =
                this.extractTagLoose(text, 'mistake_why_wrong', ['mistake_fix_suggestion'])
                || this.extractTag(text, 'mistake_why_wrong');
            const mistakeFixSuggestionRaw =
                this.extractTagLoose(text, 'mistake_fix_suggestion')
                || this.extractTag(text, 'mistake_fix_suggestion');

            const answerText = this.sanitizeXmlArtifacts(answerTextRaw);
            const analysis = this.sanitizeXmlArtifacts(analysisRaw);
            const knowledgePoints = this.parseKnowledgePoints(knowledgePointsRaw);
            const solutionFinalAnswer = this.sanitizeXmlArtifacts(solutionFinalAnswerRaw || '');
            const solutionSteps = this.parseStepList(solutionStepsRaw);
            const mistakeStudentSteps = this.parseStepList(mistakeStudentStepsRaw);
            const mistakeWrongStepIndex = this.parseOptionalInt(mistakeWrongStepIndexRaw);
            const mistakeWhyWrong = this.sanitizeXmlArtifacts(mistakeWhyWrongRaw || '');
            const mistakeFixSuggestion = this.sanitizeXmlArtifacts(mistakeFixSuggestionRaw || '');

            return {
                answerText,
                analysis,
                knowledgePoints,
                solutionFinalAnswer: solutionFinalAnswer || undefined,
                solutionSteps: solutionSteps.length > 0 ? solutionSteps : undefined,
                mistakeStudentSteps: mistakeStudentSteps.length > 0 ? mistakeStudentSteps : undefined,
                mistakeWrongStepIndex,
                mistakeWhyWrong: mistakeWhyWrong || undefined,
                mistakeFixSuggestion: mistakeFixSuggestion || undefined,
            };
        } catch (error) {
            this.handleError(error);
            throw error;
        }
    }

    private handleError(error: unknown) {
        logger.error({ error }, 'Gemini error');
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
