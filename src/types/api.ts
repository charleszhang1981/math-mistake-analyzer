import { ParsedQuestion } from "@/lib/ai/types";
import type { StructuredQuestionJson } from "@/lib/ai/structured-json";

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface Tag {
    id: string;
    name: string;
    category: string;
    subject: string;
    subcategory?: string | null;
    createdAt: string;
    updatedAt: string;
    _count?: {
        errorItems: number;
    };
}

export interface AIModel {
    id: string;
    name: string;
    owned_by?: string;
}

export interface ModelsResponse {
    models: AIModel[];
    error?: string;
}

export interface Notebook {
    id: string;
    name: string;
    userId: string;
    createdAt: string;
    updatedAt: string;
    _count?: {
        errorItems: number;
    };
}

export interface ErrorItem {
    id: string;
    questionNo: string;
    userId: string;
    subjectId?: string | null;
    subject?: Notebook | null;
    originalImageUrl: string;
    rawImageKey?: string | null;
    cropImageKey?: string | null;
    ocrText?: string | null;
    questionText?: string | null;
    answerText?: string | null;
    analysis?: string | null;
    knowledgePoints?: string | null;
    structuredJson?: StructuredQuestionJson | null;
    checkerJson?: unknown;
    diagnosisJson?: unknown;

    source?: string | null;
    errorType?: string | null;
    userNotes?: string | null;
    tags?: Tag[];
    printImageScale?: number | null;

    masteryLevel: number;
    gradeSemester?: string | null;
    paperLevel?: string | null;

    createdAt: string;
    updatedAt: string;
}

export interface ReviewQueueItem {
    errorItemId: string;
    questionText: string;
    analysis: string | null;
    tags: string[];
    cause: string;
    nextDueAt: string;
    isDue: boolean;
    lastReviewedAt: string | null;
    lastReviewCorrect: boolean | null;
    lastReviewNote: string | null;
    reviewCount: number;
}

export interface ReviewListResponse {
    items: ReviewQueueItem[];
    total: number;
    dueOnly: boolean;
}

export interface CreateErrorItemRequest extends ParsedQuestion {
    originalImageUrl: string;
    rawImageKey?: string;
    cropImageKey?: string;
    structuredJson?: StructuredQuestionJson | null;
    printImageScale?: number | null;
    checkerJson?: unknown;
    diagnosisJson?: unknown;
    subjectId?: string;
    gradeSemester?: string;
    paperLevel?: string;
}

export type AnalyzeResponse = ParsedQuestion & {
    structuredJson?: StructuredQuestionJson | null;
};

export interface UserProfile {
    id: string;
    email: string;
    name?: string | null;
    educationStage?: string | null;
    enrollmentYear?: number | null;
    role: string;
    isActive: boolean;
}

export interface UpdateUserProfileRequest {
    name?: string;
    email?: string;
    educationStage?: string;
    enrollmentYear?: number;
    password?: string;
}

export interface OpenAIInstance {
    id: string;
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    extractModel?: string;
    reasonModel?: string;
}

export interface AppConfig {
    aiProvider: 'gemini' | 'openai' | 'azure';
    allowRegistration?: boolean;
    openai?: {
        instances?: OpenAIInstance[];
        activeInstanceId?: string;
    };
    gemini?: {
        apiKey?: string;
        baseUrl?: string;
        model?: string;
        modelExtract?: string;
        modelReason?: string;
    };
    azure?: {
        apiKey?: string;
        endpoint?: string;
        deploymentName?: string;
        deploymentExtract?: string;
        deploymentReason?: string;
        apiVersion?: string;
        model?: string;
    };
    prompts?: {
        analyze?: string;
        similar?: string;
    };
    timeouts?: {
        analyze?: number;
    };
    ai?: {
        analyzeStage1MaxTokens?: number;
        analyzeStage2MaxTokens?: number;
    };
}

export interface AnalyticsData {
    totalErrors: number;
    masteredCount: number;
    masteryRate: number;
    subjectStats: { name: string; value: number }[];
    activityData: { date: string; count: number }[];
}

export interface PracticeStatsData {
    subjectStats: { name: string; value: number }[];
    activityStats: { date: string; total: number; correct: number; [key: string]: number | string }[];
    difficultyStats: { name: string; value: number }[];
    overallStats: { total: number; correct: number; rate: string };
}

export interface TagStats {
    tag: string;
    count: number;
}

export interface TagStatsResponse {
    stats: TagStats[];
}

export interface TagSuggestionsResponse {
    suggestions: string[];
}

export interface AdminUser extends UserProfile {
    createdAt: string;
    _count: {
        errorItems: number;
        practiceRecords: number;
    };
}

export interface RegisterRequest {
    name: string;
    email: string;
    password: string;
    educationStage: string;
    enrollmentYear: number;
}
