"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { apiClient } from "@/lib/api-client";
import { normalizeStructuredQuestionJson } from "@/lib/ai/structured-json";
import { PRINT_PREVIEW_PAGE_SIZE } from "@/lib/constants/pagination";
import { useLanguage } from "@/contexts/LanguageContext";
import { ErrorItem, PaginatedResponse } from "@/types/api";

type PrintMode = "review" | "redo";

function buildStepsMarkdown(steps: string[]): string {
    return steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
}

function parseLegacyTags(item: ErrorItem): string[] {
    if (item.tags && item.tags.length > 0) {
        return item.tags.map((tag) => tag.name);
    }

    try {
        const parsed = JSON.parse(item.knowledgePoints || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function PrintPreviewContent() {
    const searchParams = useSearchParams();
    const { t } = useLanguage();

    const [items, setItems] = useState<ErrorItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [printMode, setPrintMode] = useState<PrintMode>("review");

    // Legacy controls (temporarily hidden, kept for possible future rollback)
    const [showAnswers, setShowAnswers] = useState(false);
    const [showAnalysis, setShowAnalysis] = useState(false);
    const [showTags, setShowTags] = useState(false);
    const [imageScale, setImageScale] = useState(70);
    const [showQuestionText, setShowQuestionText] = useState(false);

    const fetchItems = useCallback(async () => {
        try {
            const params = new URLSearchParams(searchParams.toString());
            params.set("pageSize", String(PRINT_PREVIEW_PAGE_SIZE));
            params.set("includeSignedImage", "1");

            const response = await apiClient.get<PaginatedResponse<ErrorItem>>(
                `/api/error-items/list?${params.toString()}`
            );
            setItems(response.items);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [searchParams]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-muted-foreground">{t.common.loading}</p>
            </div>
        );
    }

    return (
        <>
            <div className="print:hidden sticky top-0 z-10 bg-background border-b p-3 sm:p-4 shadow-sm">
                <div className="max-w-6xl mx-auto space-y-3">
                    <div className="flex items-center gap-3">
                        <BackButton fallbackUrl="/notebooks" />
                        <h1 className="text-lg sm:text-xl font-bold flex-1">
                            {t.printPreview?.title || "打印预览"} ({items.length} {t.notebooks?.items || "题目"})
                        </h1>
                        <Button onClick={handlePrint} size="sm" className="whitespace-nowrap">
                            {t.printPreview?.printButton || "打印 / 保存 PDF"}
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="inline-flex rounded-md border">
                            <Button
                                size="sm"
                                variant="outline"
                                className={printMode === "review" ? "rounded-r-none bg-secondary hover:bg-secondary/90" : "rounded-r-none"}
                                onClick={() => setPrintMode("review")}
                            >
                                模式1：原题 + G + H/I
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className={printMode === "redo" ? "rounded-l-none -ml-px bg-secondary hover:bg-secondary/90" : "rounded-l-none -ml-px"}
                                onClick={() => setPrintMode("redo")}
                            >
                                模式2：仅原题重做
                            </Button>
                        </div>
                    </div>

                    <div className="hidden">
                        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
                            <div className="flex items-center gap-2 text-sm bg-muted/50 px-2 sm:px-3 py-1 rounded-md">
                                <span className="whitespace-nowrap text-xs sm:text-sm">
                                    {t.printPreview?.imageScale || "图片比例"}: {imageScale}%
                                </span>
                                <input
                                    type="range"
                                    min="30"
                                    max="100"
                                    value={imageScale}
                                    onChange={(e) => setImageScale(Number(e.target.value))}
                                    className="w-16 sm:w-20 accent-primary"
                                />
                            </div>

                            <div className="flex flex-wrap gap-x-3 gap-y-1 sm:gap-4">
                                <label className="flex items-center gap-1.5 text-xs sm:text-sm cursor-pointer whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={showQuestionText}
                                        onChange={(e) => setShowQuestionText(e.target.checked)}
                                        className="rounded border-gray-300 text-primary focus:ring-primary w-3.5 h-3.5 sm:w-4 sm:h-4"
                                    />
                                    {t.printPreview?.showQuestionText || "原题文字"}
                                </label>
                                <label className="flex items-center gap-1.5 text-xs sm:text-sm cursor-pointer whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={showAnswers}
                                        onChange={(e) => setShowAnswers(e.target.checked)}
                                        className="rounded border-gray-300 text-primary focus:ring-primary w-3.5 h-3.5 sm:w-4 sm:h-4"
                                    />
                                    {t.printPreview?.showAnswers || "显示答案"}
                                </label>
                                <label className="flex items-center gap-1.5 text-xs sm:text-sm cursor-pointer whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={showAnalysis}
                                        onChange={(e) => setShowAnalysis(e.target.checked)}
                                        className="rounded border-gray-300 text-primary focus:ring-primary w-3.5 h-3.5 sm:w-4 sm:h-4"
                                    />
                                    {t.printPreview?.showAnalysis || "显示解析"}
                                </label>
                                <label className="flex items-center gap-1.5 text-xs sm:text-sm cursor-pointer whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={showTags}
                                        onChange={(e) => setShowTags(e.target.checked)}
                                        className="rounded border-gray-300 text-primary focus:ring-primary w-3.5 h-3.5 sm:w-4 sm:h-4"
                                    />
                                    {t.printPreview?.showTags || "显示知识点"}
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-[1400px] mx-auto p-8 print:p-0 print:max-w-none">
                {items.map((item, index) => {
                    const tags = parseLegacyTags(item);
                    const structured = normalizeStructuredQuestionJson(item.structuredJson);

                    const solutionFinalAnswer = structured?.solution.finalAnswer?.trim() || item.answerText || "";
                    const solutionSteps = structured?.solution.steps || [];
                    const mistakeStudentSteps = structured?.mistake.studentSteps || [];
                    const wrongStepIndex = typeof structured?.mistake.wrongStepIndex === "number"
                        ? String(structured.mistake.wrongStepIndex + 1)
                        : "-";
                    const whyWrong = structured?.mistake.whyWrong?.trim() || item.analysis || "";
                    const fixSuggestion = structured?.mistake.fixSuggestion?.trim() || "";
                    const confirmedCause = structured?.rootCause.confirmedCause?.trim() || "";

                    return (
                        <div
                            key={item.id}
                            className="mb-8 pb-8 border-b last:border-b-0 print:break-inside-avoid"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg font-bold">
                                        {t.printPreview?.questionNumber?.replace("{num}", String(index + 1)) || `题目 ${index + 1}`}
                                    </span>
                                    {item.subject && (
                                        <span className="text-sm text-muted-foreground">{item.subject.name}</span>
                                    )}
                                    {item.gradeSemester && (
                                        <span className="text-sm text-muted-foreground">{item.gradeSemester}</span>
                                    )}
                                    {item.paperLevel && (
                                        <span className="text-sm text-muted-foreground">
                                            {t.printPreview?.paperLevel || "试卷等级"}: {item.paperLevel.toUpperCase()}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {printMode === "review" ? (
                                <div className="grid gap-4 print:grid-cols-[40%_30%_30%]">
                                    <section className="h-full rounded-md border p-3">
                                        <h3 className="mb-3 font-semibold">原题</h3>
                                        {item.originalImageUrl ? (
                                            <img
                                                src={item.originalImageUrl}
                                                alt={t.detail?.originalProblem || "原题"}
                                                className="h-auto w-full rounded border object-contain"
                                            />
                                        ) : item.questionText ? (
                                            <MarkdownRenderer content={item.questionText} />
                                        ) : (
                                            <div className="min-h-[280px] rounded border border-dashed bg-muted/20" />
                                        )}

                                        {tags.length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {tags.map((tag) => (
                                                    <span key={tag} className="rounded bg-muted px-2 py-0.5 text-xs">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </section>

                                    <section className="h-full rounded-md border p-3">
                                        <h3 className="mb-3 font-semibold">G 标准解法</h3>
                                        <div className="space-y-3">
                                            <div>
                                                <div className="mb-1 text-sm font-medium text-muted-foreground">标准答案</div>
                                                {solutionFinalAnswer ? (
                                                    <MarkdownRenderer content={solutionFinalAnswer} />
                                                ) : (
                                                    <div className="text-sm text-muted-foreground">暂无</div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="mb-1 text-sm font-medium text-muted-foreground">分步解法</div>
                                                {solutionSteps.length > 0 ? (
                                                    <MarkdownRenderer content={buildStepsMarkdown(solutionSteps)} />
                                                ) : (
                                                    <div className="text-sm text-muted-foreground">暂无</div>
                                                )}
                                            </div>
                                        </div>
                                    </section>

                                    <section className="h-full rounded-md border p-3">
                                        <h3 className="mb-3 font-semibold">H 错误定位</h3>
                                        <div className="space-y-3">
                                            <div>
                                                <div className="mb-1 text-sm font-medium text-muted-foreground">学生步骤</div>
                                                {mistakeStudentSteps.length > 0 ? (
                                                    <MarkdownRenderer content={buildStepsMarkdown(mistakeStudentSteps)} />
                                                ) : (
                                                    <div className="text-sm text-muted-foreground">暂无</div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="mb-1 text-sm font-medium text-muted-foreground">错误步骤序号</div>
                                                <div className="text-sm">{wrongStepIndex}</div>
                                            </div>
                                            <div>
                                                <div className="mb-1 text-sm font-medium text-muted-foreground">为什么错</div>
                                                {whyWrong ? (
                                                    <MarkdownRenderer content={whyWrong} />
                                                ) : (
                                                    <div className="text-sm text-muted-foreground">暂无</div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="mb-1 text-sm font-medium text-muted-foreground">如何改</div>
                                                {fixSuggestion ? (
                                                    <MarkdownRenderer content={fixSuggestion} />
                                                ) : (
                                                    <div className="text-sm text-muted-foreground">暂无</div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-4 border-t pt-3">
                                            <h4 className="mb-1 font-semibold">I 根因</h4>
                                            {confirmedCause ? (
                                                <MarkdownRenderer content={confirmedCause} />
                                            ) : (
                                                <div className="text-sm text-muted-foreground">暂无</div>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            ) : (
                                <div className="grid gap-4 print:grid-cols-[40%_60%]">
                                    <section className="h-full rounded-md border p-3">
                                        <h3 className="mb-3 font-semibold">原题</h3>
                                        {item.originalImageUrl ? (
                                            <img
                                                src={item.originalImageUrl}
                                                alt={t.detail?.originalProblem || "原题"}
                                                className="h-auto w-full rounded border object-contain"
                                            />
                                        ) : item.questionText ? (
                                            <MarkdownRenderer content={item.questionText} />
                                        ) : (
                                            <div className="min-h-[320px] rounded border border-dashed bg-muted/20" />
                                        )}
                                    </section>

                                    <section className="min-h-[360px] rounded-md border bg-white" />
                                </div>
                            )}
                        </div>
                    );
                })}

                {items.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                        {t.printPreview?.noItems || "没有符合条件的错题"}
                    </div>
                )}
            </div>
        </>
    );
}

export default function PrintPreviewPage() {
    const { t } = useLanguage();

    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{t.common.loading}</div>}>
            <PrintPreviewContent />
        </Suspense>
    );
}
