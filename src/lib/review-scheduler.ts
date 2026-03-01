const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getReviewIntervalDays(isCorrect: boolean): number {
    return isCorrect ? 3 : 1;
}

export function getNextReviewAt(base: Date, isCorrect: boolean): Date {
    return new Date(base.getTime() + getReviewIntervalDays(isCorrect) * DAY_IN_MS);
}

export function extractDiagnosisCause(diagnosisJson: unknown): string {
    void diagnosisJson;
    return "Uncategorized";
}
