import { AzureOpenAI } from "openai";
import { AIService, ParsedQuestion, DifficultyLevel, ImageExtractResult, TextReasonResult, ReanswerResult, SimilarQuestionContext } from "./types";
import {
    generateExtractPrompt,
    generateReasonPrompt,
    generateSimilarQuestionPrompt,
} from './prompts';
import { safeParseImageExtract, safeParseParsedQuestion, safeParseTextReason } from './schema';
import { getAppConfig } from '../config';
import { getMathTagsFromDB } from './tag-service';
import { createLogger } from '../logger';

const logger = createLogger('ai:azure');

export interface AzureConfig {
    apiKey?: string;
    endpoint?: string;
    deploymentName?: string;
    deploymentExtract?: string;
    deploymentReason?: string;
    apiVersion?: string;
    model?: string;
}

export class AzureOpenAIProvider implements AIService {
    private client: AzureOpenAI;
    private model: string;
    private deployment: string;
    private deploymentExtract: string;
    private deploymentReason: string;
    private endpoint: string;

    constructor(config?: AzureConfig) {
        const apiKey = config?.apiKey;
        const endpoint = config?.endpoint;
        const deployment = config?.deploymentName;

        if (!apiKey) {
            throw new Error("AI_AUTH_ERROR: AZURE_OPENAI_API_KEY is required for Azure OpenAI provider");
        }

        if (!endpoint) {
            throw new Error("AI_AUTH_ERROR: AZURE_OPENAI_ENDPOINT is required for Azure OpenAI provider");
        }

        if (!deployment) {
            throw new Error("AI_AUTH_ERROR: AZURE_OPENAI_DEPLOYMENT is required for Azure OpenAI provider");
        }

        this.client = new AzureOpenAI({
            apiKey,
            endpoint,
            deployment,
            apiVersion: config?.apiVersion || '2024-02-15-preview',
        });

        this.model = config?.model || deployment;
        this.deployment = deployment;
        this.deploymentExtract = config?.deploymentExtract || deployment;
        this.deploymentReason = config?.deploymentReason || deployment;
        this.endpoint = endpoint;

        logger.info({
            provider: 'Azure OpenAI',
            model: this.model,
            deployment: this.deployment,
            deploymentExtract: this.deploymentExtract,
            deploymentReason: this.deploymentReason,
            endpoint,
            apiKeyPrefix: apiKey.substring(0, 8) + '...'
        }, 'Azure AI Provider initialized');
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

    private parseFontSizeHint(raw: string | null): 'small' | 'normal' | 'large' {
        const value = raw?.trim().toLowerCase();
        if (value === 'small' || value === 'large' || value === 'normal') {
            return value;
        }
        return 'normal';
    }

    private parseExtractResponse(text: string): ImageExtractResult {
        const candidate: ImageExtractResult = {
            subject: '数学',
            questionText: this.extractTag(text, 'question_text') || '',
            requiresImage: this.extractTag(text, 'requires_image')?.toLowerCase().trim() === 'true',
            fontSizeHint: this.parseFontSizeHint(this.extractTag(text, 'question_font_size_hint')),
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

    // Kept for backward compatibility with older tests and non-analyze paths.
    private parseResponse(text: string): ParsedQuestion {
        const questionText = this.extractTag(text, 'question_text');
        const answerText = this.extractTag(text, 'answer_text');
        const analysis = this.extractTag(text, 'analysis');

        if (!questionText || !answerText || !analysis) {
            throw new Error('Invalid AI response: Missing critical XML tags (<question_text>, <answer_text>, or <analysis>)');
        }

        const subjectRaw = this.extractTag(text, 'subject')?.trim() || '';
        // Compatibility note:
        // older tests and fixtures contain mixed encodings for Chinese strings.
        // For math-only product scope, treat any non-invalid subject as math.
        let subject: ParsedQuestion['subject'] = '其他';
        if (subjectRaw) {
            const invalidSubjectPattern = /无效|鏃犳晥|invalid/i;
            if (!invalidSubjectPattern.test(subjectRaw) && subjectRaw !== '其他') {
                subject = '数学';
            }
        }

        return {
            questionText,
            answerText,
            analysis,
            subject,
            knowledgePoints: this.parseKnowledgePoints(this.extractTag(text, 'knowledge_points')),
            requiresImage: this.extractTag(text, 'requires_image')?.toLowerCase().trim() === 'true',
            fontSizeHint: this.parseFontSizeHint(this.extractTag(text, 'question_font_size_hint')),
            solutionFinalAnswer: this.extractTag(text, 'solution_final_answer') || undefined,
            solutionSteps: this.parseStepList(this.extractTag(text, 'solution_steps')),
            mistakeStudentSteps: this.parseStepList(this.extractTag(text, 'mistake_student_steps')),
            mistakeWrongStepIndex: this.parseOptionalInt(this.extractTag(text, 'mistake_wrong_step_index')),
            mistakeWhyWrong: this.extractTag(text, 'mistake_why_wrong') || undefined,
            mistakeFixSuggestion: this.extractTag(text, 'mistake_fix_suggestion') || undefined,
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
        mimeType: string = 'image/jpeg',
        language: 'zh' | 'en' = 'zh',
        grade?: 7 | 8 | 9 | 10 | 11 | 12 | null,
        subject?: string | null
    ): Promise<ParsedQuestion> {
        void subject;
        const limits = this.getTokenLimits();
        const flowStart = Date.now();

        const extractPrompt = generateExtractPrompt(language);
        const stage1Start = Date.now();

        logger.info({
            provider: 'Azure OpenAI',
            stage: 'extract',
            deployment: this.deploymentExtract,
            maxTokens: limits.stage1,
            endpoint: this.endpoint,
        }, 'Analyze stage1 start');

        const stage1Response = await this.client.chat.completions.create({
            model: this.deploymentExtract,
            messages: [
                {
                    role: 'system',
                    content: extractPrompt,
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${imageBase64}`,
                            },
                        },
                    ],
                },
            ],
            max_tokens: limits.stage1,
        });

        const stage1Text = stage1Response.choices?.[0]?.message?.content || '';
        if (!stage1Text) {
            throw new Error('AI_RESPONSE_ERROR: Empty stage1 response');
        }

        const extract = this.parseExtractResponse(stage1Text);

        logger.info({
            provider: 'Azure OpenAI',
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
            provider: 'Azure OpenAI',
            stage: 'reason',
            deployment: this.deploymentReason,
            maxTokens: limits.stage2,
        }, 'Analyze stage2 start');

        const stage2Response = await this.client.chat.completions.create({
            model: this.deploymentReason,
            messages: [
                {
                    role: 'system',
                    content: reasonPrompt,
                },
                {
                    role: 'user',
                    content: 'Return only the required XML-like tags.',
                },
            ],
            max_tokens: limits.stage2,
        });

        const stage2Text = stage2Response.choices?.[0]?.message?.content || '';
        if (!stage2Text) {
            throw new Error('AI_RESPONSE_ERROR: Empty stage2 response');
        }

        const reason = this.parseReasonResponse(stage2Text);

        logger.info({
            provider: 'Azure OpenAI',
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
            fontSizeHint: extract.fontSizeHint,
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
        const limits = this.getTokenLimits();
        const maxTokens = Math.min(limits.stage2, 900);
        const systemPrompt = generateSimilarQuestionPrompt(language, originalQuestion, knowledgePoints, difficulty, {
            customTemplate: config.prompts?.similar,
        }, context);

        const userPrompt = 'Generate one similar math question and return only the required XML tags.';
        const startedAt = Date.now();

        try {
            const response = await this.client.chat.completions.create({
                model: this.deploymentReason,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                max_tokens: maxTokens,
            });

            const text = response.choices?.[0]?.message?.content || '';
            if (!text) throw new Error('Empty response from AI');

            logger.info({
                provider: 'Azure OpenAI',
                stage: 'similar',
                deployment: this.deploymentReason,
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
        const limits = this.getTokenLimits();
        const prefetchedMathTags = await getMathTagsFromDB(null);
        const prompt = generateReasonPrompt(
            language,
            questionText,
            [],
            null,
            {
                customTemplate: getAppConfig().prompts?.analyze,
                prefetchedMathTags,
            }
        );

        try {
            type AzureUserContent =
                | string
                | Array<
                    | { type: 'text'; text: string }
                    | { type: 'image_url'; image_url: { url: string } }
                >;

            let userContent: AzureUserContent = 'Please provide answer and analysis based on the question.';
            if (imageBase64) {
                const imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
                userContent = [
                    { type: 'text', text: 'Use both image and question to answer.' },
                    { type: 'image_url', image_url: { url: imageUrl } },
                ];
            }

            const response = await this.client.chat.completions.create({
                model: this.deploymentReason,
                messages: [
                    { role: 'system', content: prompt },
                    { role: 'user', content: userContent },
                ],
                max_tokens: limits.stage2,
            });

            const text = response.choices?.[0]?.message?.content || '';
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
        logger.error({ error }, 'Azure OpenAI error');
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
