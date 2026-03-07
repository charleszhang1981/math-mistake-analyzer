import type { StructuredQuestionJson } from "@/lib/ai/structured-json";
import type { ReanswerResult } from "@/lib/ai/types";

export interface ResolvedMistakeFields {
    mistakeStudentSteps: string[];
    mistakeWrongStepIndex: number | null;
    mistakeWhyWrong: string;
    mistakeFixSuggestion: string;
    preservedPrevious: boolean;
}

const PLACEHOLDER_TOKENS = new Set([
    "",
    "-",
    "--",
    "none",
    "(none)",
    "n/a",
    "na",
    "null",
    "无",
    "(无)",
    "暂无",
    "暂无步骤",
    "无学生步骤",
    "无学生步骤供分析",
]);

function normalizePlaceholderText(value: string | null | undefined): string {
    return (value || "")
        .trim()
        .toLowerCase()
        .replace(/[（）()【】[\]{}]/g, "")
        .replace(/\s+/g, "");
}

function sanitizeText(value: string | null | undefined): string {
    return (value || "").trim();
}

export function isPlaceholderLikeText(value: string | null | undefined): boolean {
    return PLACEHOLDER_TOKENS.has(normalizePlaceholderText(value));
}

export function hasMeaningfulMistakeStudentSteps(steps?: string[] | null): boolean {
    if (!Array.isArray(steps) || steps.length === 0) {
        return false;
    }

    const normalized = steps
        .map((step) => sanitizeText(step))
        .filter((step) => step.length > 0);

    if (normalized.length === 0) {
        return false;
    }

    return normalized.some((step) => !isPlaceholderLikeText(step));
}

export function resolveReanswerMistakeFields(
    previousStructured: StructuredQuestionJson | null | undefined,
    result: ReanswerResult
): ResolvedMistakeFields {
    const nextSteps = Array.isArray(result.mistakeStudentSteps)
        ? result.mistakeStudentSteps.map((step) => sanitizeText(step)).filter((step) => step.length > 0)
        : [];

    if (hasMeaningfulMistakeStudentSteps(nextSteps)) {
        return {
            mistakeStudentSteps: nextSteps,
            mistakeWrongStepIndex: result.mistakeWrongStepIndex ?? null,
            mistakeWhyWrong: sanitizeText(result.mistakeWhyWrong),
            mistakeFixSuggestion: sanitizeText(result.mistakeFixSuggestion),
            preservedPrevious: false,
        };
    }

    const previousMistake = previousStructured?.mistake;
    if (previousMistake && hasMeaningfulMistakeStudentSteps(previousMistake.studentSteps)) {
        return {
            mistakeStudentSteps: previousMistake.studentSteps,
            mistakeWrongStepIndex: previousMistake.wrongStepIndex,
            mistakeWhyWrong: previousMistake.whyWrong || "",
            mistakeFixSuggestion: previousMistake.fixSuggestion || "",
            preservedPrevious: true,
        };
    }

    return {
        mistakeStudentSteps: [],
        mistakeWrongStepIndex: result.mistakeWrongStepIndex ?? null,
        mistakeWhyWrong: isPlaceholderLikeText(result.mistakeWhyWrong) ? "" : sanitizeText(result.mistakeWhyWrong),
        mistakeFixSuggestion: isPlaceholderLikeText(result.mistakeFixSuggestion) ? "" : sanitizeText(result.mistakeFixSuggestion),
        preservedPrevious: false,
    };
}
