"use client";

import { useEffect, useMemo, useState } from "react";
import { ParsedQuestion } from "@/lib/ai";
import { calculateGrade } from "@/lib/grade-calculator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, RefreshCw, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { frontendLogger } from "@/lib/frontend-logger";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { CompactNumberedSteps } from "@/components/compact-numbered-steps";
import { TagInput } from "@/components/tag-input";
import { NotebookSelector } from "@/components/notebook-selector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { UserProfile, Notebook } from "@/types/api";
import { inferSubjectFromName } from "@/lib/knowledge-tags";
import type { ReanswerResult } from "@/lib/ai/types";
import {
    buildStructuredQuestionJson,
    normalizeStructuredQuestionJson,
    type StructuredQuestionJson,
} from "@/lib/ai/structured-json";
import { resolveReanswerMistakeFields } from "@/lib/reanswer-utils";

interface ParsedQuestionWithSubject extends ParsedQuestion {
    subjectId?: string;
    gradeSemester?: string;
    paperLevel?: string;
    structuredJson?: StructuredQuestionJson | null;
}

interface CorrectionEditorProps {
    initialData: ParsedQuestion & { structuredJson?: StructuredQuestionJson | null };
    onSave: (data: ParsedQuestionWithSubject) => Promise<void>;
    onCancel: () => void;
    imagePreview?: string | null;
    initialSubjectId?: string;
    aiTimeout?: number;
}

function linesToText(lines?: string[] | null): string {
    if (!Array.isArray(lines) || lines.length === 0) return "";
    return lines.join("\n");
}

function textToLines(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

function toOneBasedIndex(zeroBasedIndex: number | null | undefined): string {
    if (!Number.isInteger(zeroBasedIndex) || zeroBasedIndex === null || zeroBasedIndex === undefined) {
        return "";
    }
    return String(zeroBasedIndex + 1);
}

function toNullableInt(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return null;
    return parsed;
}

function normalizeStepDisplayLine(line: string): string {
    return line
        .trim()
        .replace(/^\d+[\.\)]\s*/, "")
        .replace(/^(?:步骤|step)\s*\d+\s*[:：]\s*/i, "")
        .trim();
}

function normalizeMathLine(line: string): string {
    const trimmed = line.trim();
    if (!trimmed) return "";

    if (/[`$]/.test(trimmed) || /\\\(|\\\[/.test(trimmed)) {
        return line;
    }

    const withoutLeftRight = line.replace(/\\left/g, "").replace(/\\right/g, "");
    const hasLatexCommand = /\\[a-zA-Z]+/.test(withoutLeftRight);
    const hasMathOperator = /[=+\-*/^]/.test(withoutLeftRight);
    if (!hasLatexCommand && !hasMathOperator) {
        return line;
    }

    const naturalText = withoutLeftRight
        .replace(/\\[a-zA-Z]+/g, "")
        .replace(/[{}\[\]()0-9+\-*/^_=.,:\s]/g, "");

    // Mixed natural language + LaTeX: wrap only LaTeX fragments.
    if (/[A-Za-z\u4e00-\u9fff]/.test(naturalText)) {
        return withoutLeftRight.replace(
            /\\(?:frac\{[^{}]*\}\{[^{}]*\}|sqrt\{[^{}]*\}|times|div|cdot|leq|geq|neq|pm|mp|sin|cos|tan|log|ln|pi|theta|alpha|beta|gamma|delta|sum|prod|int|infty|approx|sim|text\{[^{}]*\}|boxed\{[^{}]*\})/g,
            (match) => `$${match}$`
        );
    }

    return `$${withoutLeftRight.trim()}$`;
}

export function CorrectionEditor({ initialData, onSave, onCancel, imagePreview, initialSubjectId, aiTimeout }: CorrectionEditorProps) {
    const initialStructured = useMemo(
        () => normalizeStructuredQuestionJson(initialData.structuredJson) ?? buildStructuredQuestionJson(initialData),
        [initialData]
    );
    const initialSolutionSteps = initialStructured?.solution.steps?.length
        ? initialStructured.solution.steps
        : (initialData.solutionSteps ?? []);
    const initialMistakeStudentSteps = initialStructured?.mistake.studentSteps?.length
        ? initialStructured.mistake.studentSteps
        : (initialData.mistakeStudentSteps ?? []);

    const [data, setData] = useState<ParsedQuestionWithSubject>({
        ...initialData,
        structuredJson: initialStructured,
        subjectId: initialSubjectId,
        gradeSemester: "",
        paperLevel: "a",
    });

    const { t, language } = useLanguage();
    const [isReanswering, setIsReanswering] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isQuestionEditing, setIsQuestionEditing] = useState(false);
    const [isSolutionEditing, setIsSolutionEditing] = useState(false);
    const [isMistakeEditing, setIsMistakeEditing] = useState(false);

    const [educationStage, setEducationStage] = useState<string | undefined>(undefined);
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);

    const [solutionFinalAnswer, setSolutionFinalAnswer] = useState(initialStructured?.solution.finalAnswer || initialData.answerText || "");
    const [solutionStepsText, setSolutionStepsText] = useState(linesToText(initialSolutionSteps));
    const [mistakeStudentStepsText, setMistakeStudentStepsText] = useState(linesToText(initialMistakeStudentSteps));
    const [mistakeWrongStepIndex, setMistakeWrongStepIndex] = useState(toOneBasedIndex(initialStructured?.mistake.wrongStepIndex));
    const [mistakeWhyWrong, setMistakeWhyWrong] = useState(initialStructured?.mistake.whyWrong || "");
    const [mistakeFixSuggestion, setMistakeFixSuggestion] = useState(initialStructured?.mistake.fixSuggestion || "");
    const [confirmedRootCause, setConfirmedRootCause] = useState(initialStructured?.rootCause.confirmedCause || "");

    useEffect(() => {
        apiClient.get<Notebook[]>("/api/notebooks")
            .then(setNotebooks)
            .catch((err) => console.error("Failed to fetch notebooks:", err));

        apiClient.get<UserProfile>("/api/user")
            .then((user) => {
                if (user && user.educationStage && user.enrollmentYear) {
                    const grade = calculateGrade(user.educationStage, user.enrollmentYear, new Date(), language);
                    setData((prev) => ({ ...prev, gradeSemester: grade }));
                    setEducationStage(user.educationStage);
                }
            })
            .catch((err) => console.error("Failed to fetch user info for grade calculation:", err));
    }, [language]);

    const buildStructuredForSave = (): StructuredQuestionJson | null => {
        const previousStructured = normalizeStructuredQuestionJson(data.structuredJson) ?? initialStructured;

        const rebuilt = buildStructuredQuestionJson({
            questionText: data.questionText,
            answerText: solutionFinalAnswer.trim() || data.answerText,
            analysis: data.analysis,
            solutionFinalAnswer: solutionFinalAnswer.trim(),
            solutionSteps: textToLines(solutionStepsText),
            mistakeStudentSteps: textToLines(mistakeStudentStepsText),
            mistakeWrongStepIndex: toNullableInt(mistakeWrongStepIndex),
            mistakeWhyWrong: mistakeWhyWrong.trim(),
            mistakeFixSuggestion: mistakeFixSuggestion.trim(),
        });

        if (!rebuilt) return previousStructured ?? null;

        return {
            ...rebuilt,
            rootCause: {
                studentHypothesis: previousStructured?.rootCause.studentHypothesis || "",
                confirmedCause: confirmedRootCause.trim(),
                chatSummary: previousStructured?.rootCause.chatSummary || "",
            },
        };
    };

    const applyStructuredToEditor = (structured: StructuredQuestionJson | null) => {
        if (!structured) return;

        setSolutionFinalAnswer(structured.solution.finalAnswer || "");
        setSolutionStepsText(linesToText(structured.solution.steps));
        setMistakeStudentStepsText(linesToText(structured.mistake.studentSteps));
        setMistakeWrongStepIndex(toOneBasedIndex(structured.mistake.wrongStepIndex));
        setMistakeWhyWrong(structured.mistake.whyWrong || "");
        setMistakeFixSuggestion(structured.mistake.fixSuggestion || "");
    };

    const handleReanswer = async () => {
        if (!data.questionText.trim()) {
            alert(t.editor.enterQuestionFirst || "Please enter question text first");
            return;
        }

        setIsReanswering(true);
        try {
            const requestBody: {
                questionText: string;
                language: "zh" | "en";
                subject?: string | null;
                imageBase64?: string;
            } = {
                questionText: data.questionText,
                language,
                subject: data.subject,
            };

            if (data.requiresImage && imagePreview) {
                requestBody.imageBase64 = imagePreview;
                console.log("[Reanswer] Sending image + text (Image context required)");
            } else {
                console.log("[Reanswer] Sending text only (No image required)");
            }

            frontendLogger.info("[Reanswer]", "Sending request", { timeout: aiTimeout });

            const result = await apiClient.post<ReanswerResult>(
                "/api/reanswer",
                requestBody,
                { timeout: aiTimeout || 180000 }
            );

            const previousStructured = normalizeStructuredQuestionJson(data.structuredJson) ?? initialStructured;
            const resolvedMistake = resolveReanswerMistakeFields(previousStructured, result);
            const nextStructured = buildStructuredQuestionJson({
                questionText: data.questionText,
                answerText: result.answerText,
                analysis: result.analysis,
                solutionFinalAnswer: result.solutionFinalAnswer?.trim() || result.answerText,
                solutionSteps: result.solutionSteps,
                mistakeStudentSteps: resolvedMistake.mistakeStudentSteps,
                mistakeWrongStepIndex: resolvedMistake.mistakeWrongStepIndex,
                mistakeWhyWrong: resolvedMistake.mistakeWhyWrong,
                mistakeFixSuggestion: resolvedMistake.mistakeFixSuggestion,
            });

            const mergedStructured = nextStructured
                ? {
                    ...nextStructured,
                    rootCause: {
                        ...nextStructured.rootCause,
                        confirmedCause: confirmedRootCause.trim(),
                        chatSummary: normalizeStructuredQuestionJson(data.structuredJson)?.rootCause.chatSummary || "",
                    },
                }
                : data.structuredJson || null;

            setData((prev) => ({
                ...prev,
                answerText: result.answerText,
                analysis: result.analysis,
                knowledgePoints: result.knowledgePoints?.length ? result.knowledgePoints : prev.knowledgePoints,
                solutionFinalAnswer: result.solutionFinalAnswer,
                solutionSteps: result.solutionSteps,
                mistakeStudentSteps: resolvedMistake.mistakeStudentSteps,
                mistakeWrongStepIndex: resolvedMistake.mistakeWrongStepIndex,
                mistakeWhyWrong: resolvedMistake.mistakeWhyWrong,
                mistakeFixSuggestion: resolvedMistake.mistakeFixSuggestion,
                structuredJson: mergedStructured,
            }));

            applyStructuredToEditor(mergedStructured);
            alert(t.editor.reanswerSuccess || "Answer and analysis updated!");
        } catch (error: unknown) {
            console.error("Reanswer failed:", error);
            const msg =
                typeof error === "object"
                && error !== null
                && "data" in error
                && typeof (error as { data?: { message?: unknown } }).data?.message === "string"
                    ? (error as { data?: { message?: string } }).data?.message || ""
                    : "";
            const reanswerErrors = t.errors?.reanswer || {};
            let errorText = reanswerErrors.default || "Reanswer failed";

            if (msg.includes("AI_AUTH_ERROR")) {
                errorText = reanswerErrors.authError || t.errors?.AI_AUTH_ERROR || errorText;
            } else if (msg.includes("AI_CONNECTION_FAILED")) {
                errorText = reanswerErrors.connectionFailed || t.errors?.AI_CONNECTION_FAILED || errorText;
            } else if (msg.includes("AI_RESPONSE_ERROR")) {
                errorText = reanswerErrors.responseError || t.errors?.AI_RESPONSE_ERROR || errorText;
            }

            alert(errorText);
        } finally {
            setIsReanswering(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">{t.editor.title}</h2>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onCancel}>
                        {t.editor.cancel}
                    </Button>
                    <Button
                        onClick={async () => {
                            if (!data.subjectId) {
                                alert(t.editor.messages?.selectNotebook || "Please select a notebook");
                                return;
                            }
                            if (isSaving) return;

                            setIsSaving(true);
                            try {
                                const structuredJson = buildStructuredForSave();
                                const solutionSteps = textToLines(solutionStepsText);
                                const mistakeStudentSteps = textToLines(mistakeStudentStepsText);
                                const mistakeWrongStepIndexValue = toNullableInt(mistakeWrongStepIndex);
                                await onSave({
                                    ...data,
                                    answerText: solutionFinalAnswer.trim() || data.answerText,
                                    solutionFinalAnswer: solutionFinalAnswer.trim(),
                                    solutionSteps,
                                    mistakeStudentSteps,
                                    mistakeWrongStepIndex: mistakeWrongStepIndexValue,
                                    mistakeWhyWrong: mistakeWhyWrong.trim(),
                                    mistakeFixSuggestion: mistakeFixSuggestion.trim(),
                                    structuredJson,
                                });
                            } finally {
                                setIsSaving(false);
                            }
                        }}
                        disabled={isSaving}
                    >
                        {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="mr-2 h-4 w-4" />
                        )}
                        {isSaving ? (t.common?.pleaseWait || "Please wait...") : t.editor.save}
                    </Button>
                </div>
            </div>

            <div className="space-y-6">
                {imagePreview && (
                    <Card>
                        <CardContent className="p-4">
                            <img src={imagePreview} alt="Original" className="w-full rounded-md" />
                        </CardContent>
                    </Card>
                )}

                <div className="space-y-2">
                    <Label>{t.editor.selectNotebook || "Select Notebook"}</Label>
                    <NotebookSelector
                        value={data.subjectId}
                        onChange={(id) => setData({ ...data, subjectId: id })}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>{t.editor.gradeSemester || "Grade/Semester"}</Label>
                        <Input
                            value={data.gradeSemester || ""}
                            onChange={(e) => setData({ ...data, gradeSemester: e.target.value })}
                            placeholder="e.g. Junior High Grade 1, 1st Semester"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>{t.editor.paperLevel || "Paper Level"}</Label>
                        <Select
                            value={data.paperLevel || "a"}
                            onValueChange={(val) => setData({ ...data, paperLevel: val })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="a">{t.editor.paperLevels?.a || "Paper A"}</SelectItem>
                                <SelectItem value="b">{t.editor.paperLevels?.b || "Paper B"}</SelectItem>
                                <SelectItem value="other">{t.editor.paperLevels?.other || "Other"}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>{t.editor.question}</Label>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setIsQuestionEditing((prev) => !prev)}
                        >
                            {isQuestionEditing
                                ? (t.common?.confirm || "Done")
                                : (t.common?.edit || "Edit")}
                        </Button>
                    </div>
                    {isQuestionEditing ? (
                        <Textarea
                            value={data.questionText}
                            onChange={(e) => setData({ ...data, questionText: e.target.value })}
                            className="min-h-[150px] font-mono text-sm"
                            placeholder={t.editor.placeholder || "Supports Markdown and LaTeX..."}
                        />
                    ) : (
                        <div className="min-h-[150px] rounded-md border bg-muted/20 p-3">
                            <MarkdownRenderer content={data.questionText || ""} />
                        </div>
                    )}
                    <Button
                        variant="default"
                        size="sm"
                        onClick={handleReanswer}
                        disabled={isReanswering || !data.questionText.trim()}
                        className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700"
                    >
                        {isReanswering ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t.editor.reanswering || "AI solving..."}
                            </>
                        ) : (
                            <>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                {t.editor.reanswer || "Reanswer"}
                            </>
                        )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                        {t.editor.reanswerHint || "If recognition is wrong, revise the question text then re-run AI."}
                    </p>
                </div>

                <div className="space-y-2">
                    <Label>{t.editor.tags}</Label>
                    <TagInput
                        value={data.knowledgePoints}
                        onChange={(tags) => setData({ ...data, knowledgePoints: tags })}
                        placeholder={t.editor.tagsPlaceholder || "Enter knowledge tags..."}
                        enterHint={t.editor.createTagHint}
                        subject={
                            inferSubjectFromName(notebooks.find((n) => n.id === data.subjectId)?.name || null)
                            || inferSubjectFromName(data.subject || null)
                            || undefined
                        }
                        gradeStage={educationStage}
                    />
                    <p className="text-xs text-muted-foreground">
                        {t.editor.tagsHint || "Tag suggestions will appear as you type"}
                    </p>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>{t.editor.standardSolution || "G Standard Solution"}</CardTitle>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setIsSolutionEditing((prev) => !prev)}
                                >
                                    {isSolutionEditing
                                        ? (t.common?.confirm || "Done")
                                        : (t.common?.edit || "Edit")}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>{t.editor.standardAnswer || "Standard Answer"}</Label>
                                {isSolutionEditing ? (
                                    <Textarea
                                        value={solutionFinalAnswer}
                                        onChange={(e) => setSolutionFinalAnswer(e.target.value)}
                                        className="min-h-[90px] font-mono text-sm"
                                        placeholder={t.editor.placeholder || "Supports Markdown and LaTeX..."}
                                    />
                                ) : (
                                    <div className="min-h-[90px] rounded-md border bg-muted/20 p-3">
                                        <MarkdownRenderer content={normalizeMathLine(solutionFinalAnswer || "")} />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label>{t.editor.solutionSteps || "Step-by-Step Solution"}</Label>
                                {isSolutionEditing ? (
                                    <Textarea
                                        value={solutionStepsText}
                                        onChange={(e) => setSolutionStepsText(e.target.value)}
                                        className="min-h-[220px] font-mono text-sm"
                                        placeholder={t.editor.solutionStepsPlaceholder || "One step per line"}
                                    />
                                ) : (
                                    <div className="min-h-[220px] rounded-md border bg-muted/20 p-3">
                                        <CompactNumberedSteps
                                            steps={textToLines(solutionStepsText)}
                                            normalizeStep={normalizeMathLine}
                                        />
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>{t.editor.errorLocalization || "H Error Localization"}</CardTitle>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setIsMistakeEditing((prev) => !prev)}
                                    >
                                        {isMistakeEditing
                                            ? (t.common?.confirm || "Done")
                                            : (t.common?.edit || "Edit")}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isMistakeEditing ? (
                                    <>
                                        <div className="space-y-2">
                                            <Label>{t.editor.studentSteps || "Student Steps"}</Label>
                                            <Textarea
                                                value={mistakeStudentStepsText}
                                                onChange={(e) => setMistakeStudentStepsText(e.target.value)}
                                                className="min-h-[140px] font-mono text-sm"
                                                placeholder={t.editor.solutionStepsPlaceholder || "One step per line"}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label>{t.editor.wrongStepIndex || "Wrong Step Index (1-based)"}</Label>
                                            <Input
                                                value={mistakeWrongStepIndex}
                                                onChange={(e) => setMistakeWrongStepIndex(e.target.value)}
                                                inputMode="numeric"
                                                placeholder="e.g. 2"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label>{t.editor.whyWrong || "Why Wrong"}</Label>
                                            <Textarea
                                                value={mistakeWhyWrong}
                                                onChange={(e) => setMistakeWhyWrong(e.target.value)}
                                                className="min-h-[90px]"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label>{t.editor.fixSuggestion || "How to Fix"}</Label>
                                            <Textarea
                                                value={mistakeFixSuggestion}
                                                onChange={(e) => setMistakeFixSuggestion(e.target.value)}
                                                className="min-h-[90px]"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <Label>{t.editor.studentSteps || "Student Steps"}</Label>
                                            <div className="min-h-[140px] rounded-md border bg-muted/20 p-3">
                                                <CompactNumberedSteps
                                                    steps={textToLines(mistakeStudentStepsText)}
                                                    normalizeStep={(line) => normalizeMathLine(normalizeStepDisplayLine(line))}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>{t.editor.wrongStepIndex || "Wrong Step Index (1-based)"}</Label>
                                            <div className="rounded-md border bg-muted/20 p-3 text-sm">
                                                {mistakeWrongStepIndex.trim() || "-"}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>{t.editor.whyWrong || "Why Wrong"}</Label>
                                            <div className="min-h-[90px] rounded-md border bg-muted/20 p-3">
                                                <MarkdownRenderer content={normalizeMathLine(mistakeWhyWrong || "")} />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>{t.editor.fixSuggestion || "How to Fix"}</Label>
                                            <div className="min-h-[90px] rounded-md border bg-muted/20 p-3">
                                                <MarkdownRenderer content={normalizeMathLine(mistakeFixSuggestion || "")} />
                                            </div>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{t.editor.selfDiagnosis || "I Root-Cause Self Diagnosis"}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label>{t.editor.finalRootCause || "Final Root Cause (Confirmed)"}</Label>
                                    <Textarea
                                        value={confirmedRootCause}
                                        onChange={(e) => setConfirmedRootCause(e.target.value)}
                                        className="min-h-[90px]"
                                        placeholder={t.editor.finalRootCausePlaceholder || "Summarize the confirmed root cause"}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
