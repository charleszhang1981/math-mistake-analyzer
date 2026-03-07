"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, House, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { frontendLogger } from "@/lib/frontend-logger";
import { CompactNumberedSteps } from "@/components/compact-numbered-steps";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import type { ParsedQuestion, ReanswerResult } from "@/lib/ai/types";
import type { AppConfig } from "@/types/api";

export const dynamic = "force-dynamic";

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

    if (/[A-Za-z\u4e00-\u9fff]/.test(naturalText)) {
        return withoutLeftRight.replace(
            /\\(?:frac\{[^{}]*\}\{[^{}]*\}|sqrt\{[^{}]*\}|times|div|cdot|leq|geq|neq|pm|mp|sin|cos|tan|log|ln|pi|theta|alpha|beta|gamma|delta|sum|prod|int|infty|approx|sim|text\{[^{}]*\}|boxed\{[^{}]*\})/g,
            (match) => `$${match}$`
        );
    }

    return `$${withoutLeftRight.trim()}$`;
}

function normalizeStepDisplayLine(line: string): string {
    return line
        .trim()
        .replace(/^\d+[\.\)]\s*/, "")
        .replace(/^(?:步骤|step)\s*\d+\s*[:：]\s*/i, "")
        .trim();
}

function PracticeContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const errorItemId = searchParams.get("id");
    const { t, language } = useLanguage();

    const [config, setConfig] = useState<AppConfig | null>(null);
    const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "harder">("medium");
    const [question, setQuestion] = useState<ParsedQuestion | null>(null);
    const [aiSolution, setAiSolution] = useState<ReanswerResult | null>(null);
    const [loadingQuestion, setLoadingQuestion] = useState(false);
    const [solving, setSolving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        apiClient
            .get<AppConfig>("/api/settings")
            .then((data) => setConfig(data))
            .catch((err) => console.error(err));
    }, []);

    const timeout = config?.timeouts?.analyze || 180000;

    const generateQuestion = async () => {
        if (!errorItemId) return;

        setLoadingQuestion(true);
        setError(null);
        setAiSolution(null);
        try {
            frontendLogger.info("[Practice]", "Generating question", { timeout });
            const data = await apiClient.post<ParsedQuestion>(
                "/api/practice/generate",
                {
                    errorItemId,
                    language,
                    difficulty,
                },
                { timeout }
            );
            setQuestion(data);
        } catch (e: any) {
            console.error(e);
            const msg = e?.data?.message || "";
            let errorMessage = t.practice.errors?.default || "生成题目失败";
            if (msg.includes("AI_CONNECTION_FAILED")) {
                errorMessage = t.errors?.aiConnectionFailed || errorMessage;
            } else if (msg.includes("AI_RESPONSE_ERROR")) {
                errorMessage = t.errors?.aiResponseError || errorMessage;
            } else if (msg.includes("AI_AUTH_ERROR")) {
                errorMessage = t.errors?.aiAuth || errorMessage;
            } else if (msg.includes("AI_UNKNOWN_ERROR")) {
                errorMessage = t.errors?.AI_UNKNOWN_ERROR || errorMessage;
            }
            setError(errorMessage);
        } finally {
            setLoadingQuestion(false);
        }
    };

    const solveWithAI = async () => {
        if (!question?.questionText?.trim() || solving) return;

        setSolving(true);
        setError(null);
        try {
            frontendLogger.info("[Practice]", "Solving generated question", { timeout });
            const result = await apiClient.post<ReanswerResult>(
                "/api/reanswer",
                {
                    questionText: question.questionText,
                    language,
                    subject: "数学",
                },
                { timeout }
            );
            setAiSolution(result);
        } catch (e: any) {
            console.error(e);
            const msg = e?.data?.message || "";
            let errorMessage = "AI 解题失败，请重试";
            if (msg.includes("AI_CONNECTION_FAILED")) {
                errorMessage = t.errors?.aiConnectionFailed || errorMessage;
            } else if (msg.includes("AI_RESPONSE_ERROR")) {
                errorMessage = t.errors?.aiResponseError || errorMessage;
            } else if (msg.includes("AI_AUTH_ERROR")) {
                errorMessage = t.errors?.aiAuth || errorMessage;
            } else if (msg.includes("AI_UNKNOWN_ERROR")) {
                errorMessage = t.errors?.AI_UNKNOWN_ERROR || errorMessage;
            }
            setError(errorMessage);
        } finally {
            setSolving(false);
        }
    };

    const standardAnswer = useMemo(() => {
        if (!aiSolution) return "";
        return aiSolution.solutionFinalAnswer?.trim() || aiSolution.answerText || "";
    }, [aiSolution]);

    const solutionStepLines = useMemo<string[]>(() => {
        if (!aiSolution) return [];
        if (aiSolution.solutionSteps && aiSolution.solutionSteps.length > 0) {
            return aiSolution.solutionSteps
                .map((line) => normalizeStepDisplayLine(line))
                .filter((line) => line.length > 0);
        }
        return aiSolution.analysis
            .split(/\r?\n/)
            .map((line) => normalizeStepDisplayLine(line))
            .filter((line) => line.length > 0);
    }, [aiSolution]);

    if (!errorItemId) {
        return <div className="p-8 text-center">{t.practice.invalidRequest || "Invalid Request"}</div>;
    }

    return (
        <div className="mx-auto max-w-3xl space-y-8">
            <div className="mb-4 flex items-center justify-between">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t.common?.back || "返回"}
                </Button>
                <Link href="/">
                    <Button variant="ghost" size="icon">
                        <House className="h-5 w-5" />
                    </Button>
                </Link>
            </div>

            <div className="space-y-4 text-center">
                <h1 className="text-3xl font-bold">{t.practice.title}</h1>
                <p className="text-muted-foreground">{t.practice.subtitle}</p>

                {error && (
                    <div className="relative rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700" role="alert">
                        <strong className="font-bold">{t.common?.error || "Error"}: </strong>
                        <span className="block whitespace-pre-wrap">{error}</span>
                    </div>
                )}

                {!question && (
                    <div className="flex flex-col items-center gap-4">
                        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                            <span className="text-sm font-medium text-muted-foreground">
                                {t.practice.difficulty?.label || "难度"}:
                            </span>
                            <div className="flex gap-1">
                                {[
                                    { value: "easy", label: t.practice.difficulty?.easy || "简单", color: "bg-green-100 text-green-700 hover:bg-green-200" },
                                    { value: "medium", label: t.practice.difficulty?.medium || "中等", color: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
                                    { value: "hard", label: t.practice.difficulty?.hard || "困难", color: "bg-orange-100 text-orange-700 hover:bg-orange-200" },
                                    { value: "harder", label: t.practice.difficulty?.harder || "挑战", color: "bg-red-100 text-red-700 hover:bg-red-200" },
                                ].map((level) => (
                                    <button
                                        key={level.value}
                                        onClick={() => setDifficulty(level.value as typeof difficulty)}
                                        className={`px-3 py-1.5 text-sm font-medium transition-colors rounded-md ${
                                            difficulty === level.value
                                                ? `${level.color} ring-2 ring-offset-1`
                                                : "bg-transparent text-muted-foreground hover:bg-muted"
                                        }`}
                                    >
                                        {level.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Button size="lg" onClick={generateQuestion} disabled={loadingQuestion}>
                            {loadingQuestion ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t.practice.generating || "生成中..."}
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    {t.practice.generate || "生成练习题"}
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </div>

            {question && (
                <div className="animate-in slide-in-from-bottom-4 space-y-6 fade-in duration-500">
                    <Card className="border-primary/50 shadow-lg">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>{t.app.practiceProblem || "练习题"}</span>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={difficulty}
                                        onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                                        className="h-8 rounded border bg-background px-2 text-xs"
                                        disabled={loadingQuestion}
                                    >
                                        <option value="easy">{t.practice.difficulty?.easy || "简单"}</option>
                                        <option value="medium">{t.practice.difficulty?.medium || "中等"}</option>
                                        <option value="hard">{t.practice.difficulty?.hard || "困难"}</option>
                                        <option value="harder">{t.practice.difficulty?.harder || "挑战"}</option>
                                    </select>
                                    <Button variant="ghost" size="sm" onClick={generateQuestion} disabled={loadingQuestion}>
                                        {loadingQuestion ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                {t.practice.generating || "生成中..."}
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw className="mr-2 h-4 w-4" />
                                                {t.practice.regenerate || "重新生成"}
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <MarkdownRenderer content={question.questionText} className="font-medium" />
                        </CardContent>
                    </Card>

                    <div className="flex justify-center">
                        <Button size="lg" onClick={solveWithAI} disabled={solving} className="w-full md:w-auto">
                            {solving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    AI 解题中...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    AI解题
                                </>
                            )}
                        </Button>
                    </div>

                    {aiSolution && (
                        <div className="animate-in slide-in-from-top-2 space-y-6 fade-in">
                            <Card>
                                <CardHeader>
                                    <CardTitle>G 标准解法</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <div className="text-sm text-muted-foreground">标准答案</div>
                                        <div className="rounded-md border bg-muted/20 p-3">
                                            <MarkdownRenderer content={normalizeMathLine(standardAnswer)} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="text-sm text-muted-foreground">分步解法</div>
                                        <div className="rounded-md border bg-muted/20 p-3">
                                            {Array.isArray(solutionStepLines) && solutionStepLines.length > 0 ? (
                                                <CompactNumberedSteps
                                                    steps={solutionStepLines}
                                                    normalizeStep={normalizeMathLine}
                                                />
                                            ) : (
                                                <MarkdownRenderer content={aiSolution.analysis || ""} />
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function PracticePage() {
    return (
        <main className="min-h-screen bg-background p-8">
            <Suspense
                fallback={
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                }
            >
                <PracticeContent />
            </Suspense>
        </main>
    );
}
