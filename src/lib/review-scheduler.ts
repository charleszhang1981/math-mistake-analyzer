import { normalizeDiagnosisJson } from "@/lib/math-checker";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getReviewIntervalDays(isCorrect: boolean): number {
    return isCorrect ? 3 : 1;
}

export function getNextReviewAt(base: Date, isCorrect: boolean): Date {
    return new Date(base.getTime() + getReviewIntervalDays(isCorrect) * DAY_IN_MS);
}

export function extractDiagnosisCause(diagnosisJson: unknown): string {
    const diagnosis = normalizeDiagnosisJson(diagnosisJson);
    if (!diagnosis) return "Uncategorized";

    const finalCause = diagnosis.finalCause?.trim();
    if (finalCause) return finalCause;

    const firstCause = diagnosis.candidates[0]?.cause?.trim();
    if (firstCause) return firstCause;

    return "Uncategorized";
}
