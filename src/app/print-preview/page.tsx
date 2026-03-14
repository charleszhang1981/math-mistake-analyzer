"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { CompactNumberedSteps } from "@/components/compact-numbered-steps";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { apiClient } from "@/lib/api-client";
import { normalizeStructuredQuestionJson } from "@/lib/ai/structured-json";
import { PRINT_PREVIEW_PAGE_SIZE } from "@/lib/constants/pagination";
import { useLanguage } from "@/contexts/LanguageContext";
import { ErrorItem, PaginatedResponse } from "@/types/api";
import {
    applyCanvasSafeThemeVariables,
    buildPdfPageSlices,
    buildPdfPageSlicesFromBlocks,
    buildPrintPreviewPdfFilename,
    calculatePdfPageHeightPx,
    isLikelyMobilePdfExport,
    MOBILE_EXPORT_A4_WIDTH_PX,
} from "@/lib/print-pdf";
import { Loader2 } from "lucide-react";

type PrintMode = "review" | "redo";
type PrintRenderLayout = "screen" | "mobile-export";

function normalizeStepLine(step: string): string {
    const trimmed = step.trim();
    if (!trimmed) return "";

    const withoutPrefix = trimmed.replace(/^(\d+[\.\)]\s*|[-*]\s*)/, "");
    if (/[`$]/.test(withoutPrefix) || /\\\(|\\\[/.test(withoutPrefix)) {
        return withoutPrefix;
    }

    const hasLatex = /\\[a-zA-Z]+/.test(withoutPrefix);
    if (!hasLatex) {
        return withoutPrefix;
    }

    const equalIndex = withoutPrefix.indexOf("=");
    if (equalIndex > -1 && equalIndex < withoutPrefix.length - 1) {
        const left = withoutPrefix.slice(0, equalIndex + 1).trimEnd();
        const right = withoutPrefix.slice(equalIndex + 1).trim();
        return `${left} $${right}$`;
    }

    return `$${withoutPrefix}$`;
}

type PrintPreviewText = ReturnType<typeof useLanguage>["t"];

interface PrintItemsProps {
    items: ErrorItem[];
    printMode: PrintMode;
    layout: PrintRenderLayout;
    t: PrintPreviewText;
}

function PrintItems({ items, printMode, layout, t }: PrintItemsProps) {
    const isExportLayout = layout === "mobile-export";

    const itemWrapperClass = isExportLayout
        ? "mb-2 break-inside-avoid border-b pb-2 last:border-b-0"
        : "mb-2 border-b pb-2 last:border-b-0 print:mb-1 print:break-inside-avoid print:pb-1";
    const reviewGridClass = isExportLayout
        ? "grid gap-4 grid-cols-[50%_50%]"
        : "grid gap-4 md:grid-cols-[50%_50%] print:grid-cols-[50%_50%]";
    const redoGridClass = isExportLayout
        ? "grid gap-4 grid-cols-[40%_60%]"
        : "grid gap-4 md:grid-cols-[40%_60%] print:grid-cols-[40%_60%]";
    const reviewSectionClass = isExportLayout
        ? "h-full rounded-md border p-2"
        : "h-full rounded-md border p-2.5 print:p-2";
    const redoQuestionSectionClass = isExportLayout
        ? "h-full rounded-md border p-2"
        : "h-full rounded-md border p-3 print:p-2";

    if (items.length === 0) {
        return (
            <div className="py-12 text-center text-muted-foreground">
                {t.printPreview?.noItems || "没有符合条件的错题"}
            </div>
        );
    }

    return (
        <>
            {items.map((item, index) => {
                const structured = normalizeStructuredQuestionJson(item.structuredJson);

                const solutionFinalAnswer = structured?.solution.finalAnswer?.trim() || item.answerText || "";
                const solutionSteps = structured?.solution.steps || [];
                const whyWrong = structured?.mistake.whyWrong?.trim() || "";
                const confirmedCause = structured?.rootCause.confirmedCause?.trim() || "";
                const fontSizeHint = structured?.problem.fontSizeHint || "normal";
                const originalImageWidthClass = fontSizeHint === "large"
                    ? "w-[60%]"
                    : fontSizeHint === "small"
                        ? "w-[90%]"
                        : "w-[80%]";

                return (
                    <div key={item.id} className={itemWrapperClass} data-print-item="true">
                        <div className="mb-1 flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-lg font-bold">
                                    {item.questionNo ? `题号：${item.questionNo}` : (t.printPreview?.questionNumber?.replace("{num}", String(index + 1)) || `题目 ${index + 1}`)}
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
                            <div className={reviewGridClass}>
                                <section className={reviewSectionClass}>
                                    <h3 className="mb-2 text-base font-semibold leading-tight">原题</h3>
                                    {item.originalImageUrl ? (
                                        <img
                                            src={item.originalImageUrl}
                                            alt={t.detail?.originalProblem || "原题"}
                                            className={`h-auto ${originalImageWidthClass} max-w-full rounded border object-contain`}
                                        />
                                    ) : item.questionText ? (
                                        <MarkdownRenderer content={item.questionText} />
                                    ) : (
                                        <div className="min-h-[280px] rounded border border-dashed bg-muted/20" />
                                    )}

                                    {whyWrong && (
                                        <div className="mt-2 border-t pt-2">
                                            <div className="inline-field">
                                                <span className="inline-field-label">错误定位：</span>
                                                <MarkdownRenderer content={whyWrong} className="inline-field-content" />
                                            </div>
                                        </div>
                                    )}
                                </section>

                                <section className={reviewSectionClass}>
                                    <h3 className="mb-2 text-base font-semibold leading-tight">标准解法</h3>
                                    <div className="space-y-2">
                                        <div>
                                            <div className="inline-field">
                                                <span className="inline-field-label text-muted-foreground">标准答案：</span>
                                                {solutionFinalAnswer ? (
                                                    <MarkdownRenderer content={solutionFinalAnswer} className="inline-field-content" />
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">暂无</span>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="mb-1 text-sm font-medium text-muted-foreground">分步解法</div>
                                            {solutionSteps.length > 0 ? (
                                                <CompactNumberedSteps
                                                    steps={solutionSteps}
                                                    normalizeStep={normalizeStepLine}
                                                    className="text-sm"
                                                    itemClassName="gap-1.5 leading-tight"
                                                    markerClassName="w-5"
                                                />
                                            ) : (
                                                <div className="text-sm text-muted-foreground">暂无</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-2 border-t pt-2">
                                        {confirmedCause ? (
                                            <div className="inline-field">
                                                <span className="inline-field-label">根因：</span>
                                                <MarkdownRenderer content={confirmedCause} className="inline-field-content" />
                                            </div>
                                        ) : (
                                            <div className="inline-field">
                                                <span className="inline-field-label">根因：</span>
                                                <span className="text-sm text-muted-foreground">暂无</span>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            </div>
                        ) : (
                            <div className={redoGridClass}>
                                <section className={redoQuestionSectionClass}>
                                    <h3 className="mb-3 font-semibold">原题</h3>
                                    {item.originalImageUrl ? (
                                        <img
                                            src={item.originalImageUrl}
                                            alt={t.detail?.originalProblem || "原题"}
                                            className={`h-auto ${originalImageWidthClass} max-w-full rounded border object-contain`}
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
        </>
    );
}

function PrintPreviewContent() {
    const searchParams = useSearchParams();
    const { t } = useLanguage();
    const subjectId = searchParams.get("subjectId");
    const notebookFallbackUrl = subjectId ? `/notebooks/${subjectId}` : "/notebooks";

    const [items, setItems] = useState<ErrorItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [printMode, setPrintMode] = useState<PrintMode>("review");
    const [isMobileExportMode, setIsMobileExportMode] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const printContentRef = useRef<HTMLDivElement>(null);
    const mobileExportContentRef = useRef<HTMLDivElement>(null);

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

    useEffect(() => {
        if (typeof window === "undefined") return;

        const mediaQuery = window.matchMedia("(pointer: coarse)");

        const updateMode = () => {
            setIsMobileExportMode(
                isLikelyMobilePdfExport({
                    viewportWidth: window.innerWidth,
                    hasCoarsePointer: mediaQuery.matches,
                    userAgent: navigator.userAgent,
                })
            );
        };

        updateMode();
        if (typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener("change", updateMode);
        } else {
            mediaQuery.addListener(updateMode);
        }
        window.addEventListener("resize", updateMode);

        return () => {
            if (typeof mediaQuery.removeEventListener === "function") {
                mediaQuery.removeEventListener("change", updateMode);
            } else {
                mediaQuery.removeListener(updateMode);
            }
            window.removeEventListener("resize", updateMode);
        };
    }, []);

    const handlePrint = async () => {
        if (!isMobileExportMode) {
            window.print();
            return;
        }

        const target = mobileExportContentRef.current ?? printContentRef.current;
        if (!target) {
            alert("PDF 导出失败，请稍后重试。");
            return;
        }

        setIsExportingPdf(true);

        try {
            const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
                import("html2canvas"),
                import("jspdf"),
            ]);

            const canvas = await html2canvas(target, {
                backgroundColor: "#ffffff",
                scale: Math.min(window.devicePixelRatio || 2, 2),
                useCORS: true,
                logging: false,
                imageTimeout: 15000,
                width: target.scrollWidth,
                height: target.scrollHeight,
                windowWidth: target.scrollWidth,
                windowHeight: target.scrollHeight,
                scrollX: 0,
                scrollY: 0,
                onclone: (clonedDocument) => {
                    const clonedRoot = clonedDocument.documentElement;
                    const clonedBody = clonedDocument.body;

                    applyCanvasSafeThemeVariables(clonedRoot);
                    clonedRoot.classList.remove("dark");
                    clonedBody.classList.remove("dark");
                    clonedRoot.style.colorScheme = "light";
                    clonedBody.style.backgroundColor = "#ffffff";
                    clonedBody.style.color = "#171717";
                },
            });

            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4",
                compress: true,
            });

            const pageWidthMm = pdf.internal.pageSize.getWidth();
            const pageHeightMm = pdf.internal.pageSize.getHeight();
            const pageHeightPx = calculatePdfPageHeightPx(canvas.width, pageWidthMm, pageHeightMm);
            const targetRect = target.getBoundingClientRect();
            const domToCanvasScale = target.scrollHeight > 0 ? canvas.height / target.scrollHeight : 1;
            const contentBlocks = Array.from(target.querySelectorAll<HTMLElement>("[data-print-item='true']"))
                .map((element) => {
                    const rect = element.getBoundingClientRect();
                    return {
                        offsetY: (rect.top - targetRect.top) * domToCanvasScale,
                        height: rect.height * domToCanvasScale,
                    };
                });
            const pageSlices = contentBlocks.length > 0
                ? buildPdfPageSlicesFromBlocks(canvas.height, pageHeightPx, contentBlocks)
                : buildPdfPageSlices(canvas.height, pageHeightPx);

            pageSlices.forEach((slice, index) => {
                const pageCanvas = document.createElement("canvas");
                pageCanvas.width = canvas.width;
                pageCanvas.height = slice.height;

                const ctx = pageCanvas.getContext("2d");
                if (!ctx) {
                    throw new Error("Failed to create PDF page canvas");
                }

                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
                ctx.drawImage(
                    canvas,
                    0,
                    slice.offsetY,
                    canvas.width,
                    slice.height,
                    0,
                    0,
                    pageCanvas.width,
                    pageCanvas.height
                );

                const imageData = pageCanvas.toDataURL("image/jpeg", 0.95);
                const imageHeightMm = (slice.height * pageWidthMm) / canvas.width;

                if (index > 0) {
                    pdf.addPage();
                }

                pdf.addImage(imageData, "JPEG", 0, 0, pageWidthMm, imageHeightMm, undefined, "FAST");
            });

            pdf.save(buildPrintPreviewPdfFilename());
        } catch (error) {
            console.error(error);
            alert("PDF 导出失败，请稍后重试。");
        } finally {
            setIsExportingPdf(false);
        }
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
                        <BackButton fallbackUrl={notebookFallbackUrl} />
                        <h1 className="text-lg sm:text-xl font-bold flex-1">
                            {t.printPreview?.title || "打印预览"} ({items.length} {t.notebooks?.items || "题目"})
                        </h1>
                        <Button onClick={handlePrint} size="sm" className="whitespace-nowrap" disabled={isExportingPdf}>
                            {isExportingPdf ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    导出中...
                                </>
                            ) : isMobileExportMode ? (
                                "导出 PDF"
                            ) : (
                                t.printPreview?.printButton || "打印 / 保存 PDF"
                            )}
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
                                模式1：原题 + G + 简版H + I
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

            <div
                ref={printContentRef}
                data-print-capture-root="true"
                className="max-w-[1400px] mx-auto p-8 print:p-0 print:max-w-none print-sheet"
            >
                <PrintItems items={items} printMode={printMode} layout="screen" t={t} />
            </div>

            {isMobileExportMode && (
                <div
                    ref={mobileExportContentRef}
                    aria-hidden="true"
                    className="fixed top-0 bg-white p-8 pdf-export-sheet"
                    style={{ left: -10000, width: MOBILE_EXPORT_A4_WIDTH_PX }}
                >
                    <PrintItems items={items} printMode={printMode} layout="mobile-export" t={t} />
                </div>
            )}
        </>
    );
}

export default function PrintPreviewPage() {
    const { t } = useLanguage();

    return (
        <>
            <style jsx global>{`
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 0;
                    }

                    .print-sheet {
                        font-size: 11.5px;
                        line-height: 1.25;
                    }

                    .print-sheet .markdown-content p {
                        margin-bottom: 0.2rem;
                        line-height: 1.25;
                    }

                    .print-sheet .markdown-content ol,
                    .print-sheet .markdown-content ul {
                        margin-bottom: 0.2rem;
                    }

                    .print-sheet .katex {
                        font-size: 0.95em;
                    }
                }

                .pdf-export-sheet {
                    font-size: 11.75px;
                    line-height: 1.4;
                    color: #171717;
                }

                .pdf-export-sheet .markdown-content p {
                    margin-bottom: 0.24rem;
                    line-height: 1.42;
                }

                .pdf-export-sheet .markdown-content ol,
                .pdf-export-sheet .markdown-content ul {
                    margin-bottom: 0.24rem;
                }

                .pdf-export-sheet .katex {
                    font-size: 0.95em;
                }

                .pdf-export-sheet section,
                .pdf-export-sheet .markdown-content,
                .pdf-export-sheet .inline-field-content,
                .pdf-export-sheet .compact-numbered-steps {
                    overflow: visible;
                }

                .pdf-export-sheet .inline-field {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.35rem;
                    line-height: 1.42;
                    padding-block: 0.08rem;
                }

                .pdf-export-sheet .inline-field-label {
                    display: inline-block;
                    line-height: 1.42;
                    padding-top: 0.02rem;
                }

                .pdf-export-sheet .inline-field-content {
                    display: block;
                    min-width: 0;
                    flex: 1 1 auto;
                    padding-bottom: 0.08rem;
                }

                .pdf-export-sheet .inline-field-content p {
                    display: inline-block;
                    margin: 0;
                    line-height: 1.42;
                    vertical-align: top;
                }

                .pdf-export-sheet .compact-numbered-steps > div {
                    align-items: flex-start;
                    min-height: 1.6em;
                }

                .pdf-export-sheet .compact-numbered-steps .markdown-content p {
                    display: inline-block;
                    line-height: 1.38;
                    vertical-align: top;
                }

                .inline-field {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.25rem;
                    line-height: 1.25;
                }

                .inline-field-label {
                    font-weight: 600;
                    white-space: nowrap;
                }

                .inline-field-content {
                    min-width: 0;
                }

                .inline-field-content p {
                    display: inline;
                    margin: 0;
                }

            `}</style>
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{t.common.loading}</div>}>
                <PrintPreviewContent />
            </Suspense>
        </>
    );
}
