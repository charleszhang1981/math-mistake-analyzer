"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, RefreshCw, Trash2, Edit, Save, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { CompactNumberedSteps } from "@/components/compact-numbered-steps";
import { TagInput } from "@/components/tag-input";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { UserProfile } from "@/types/api";
import { inferSubjectFromName } from "@/lib/knowledge-tags";
import { normalizeStructuredQuestionJson, type StructuredQuestionJson } from "@/lib/ai/structured-json";
import { extractStorageKeyFromImageRef } from "@/lib/storage-key";

interface KnowledgeTag {
    id: string;
    name: string;
}

interface ErrorItemDetail {
    id: string;
    questionNo: string;
    questionText: string;
    answerText: string;
    analysis: string;
    knowledgePoints: string; // 淇濈暀鍏煎鏃ф暟鎹?
    tags: KnowledgeTag[]; // 鏂扮殑鏍囩鍏宠仈
    masteryLevel: number;
    originalImageUrl: string;
    rawImageKey?: string | null;
    cropImageKey?: string | null;
    displayImageKey?: string | null;
    userNotes: string | null;
    subjectId?: string | null;
    subject?: {
        id: string;
        name: string;
    } | null;
    gradeSemester?: string | null;
    paperLevel?: string | null;
    structuredJson?: StructuredQuestionJson | null;
}

function isHttpUrl(url: string | null | undefined): boolean {
    return typeof url === "string" && /^https?:\/\//i.test(url);
}

function getResolvableImageKey(item: ErrorItemDetail): string | null {
    if (item.displayImageKey) return item.displayImageKey;
    if (item.cropImageKey) return item.cropImageKey;
    if (item.rawImageKey) return item.rawImageKey;
    return extractStorageKeyFromImageRef(item.originalImageUrl);
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

function normalizeStepDisplayLine(line: string): string {
    return line
        .trim()
        .replace(/^\d+[\.\)]\s*/, "")
        .replace(/^(?:步骤|step)\s*\d+\s*[:：]\s*/i, "")
        .trim();
}

export default function ErrorDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { t } = useLanguage();
    const [item, setItem] = useState<ErrorItemDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
    const [isEditingTags, setIsEditingTags] = useState(false);
    const [isSavingTags, setIsSavingTags] = useState(false);
    const [tagsInput, setTagsInput] = useState<string[]>([]);
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    const [isSavingMetadata, setIsSavingMetadata] = useState(false);
    const [gradeSemesterInput, setGradeSemesterInput] = useState("");
    const [paperLevelInput, setPaperLevelInput] = useState("a");
    const [isEditingRootCause, setIsEditingRootCause] = useState(false);
    const [rootCauseInput, setRootCauseInput] = useState("");
    const [isEditingSolution, setIsEditingSolution] = useState(false);
    const [solutionFinalAnswerInput, setSolutionFinalAnswerInput] = useState("");
    const [solutionStepsInput, setSolutionStepsInput] = useState("");
    const [isEditingMistake, setIsEditingMistake] = useState(false);
    const [mistakeStudentStepsInput, setMistakeStudentStepsInput] = useState("");
    const [mistakeWrongStepIndexInput, setMistakeWrongStepIndexInput] = useState("");
    const [mistakeWhyWrongInput, setMistakeWhyWrongInput] = useState("");
    const [mistakeFixSuggestionInput, setMistakeFixSuggestionInput] = useState("");

    const [educationStage, setEducationStage] = useState<string | undefined>(undefined);
    const [isSavingQuestion, setIsSavingQuestion] = useState(false);

    useEffect(() => {
        // Fetch user info for education stage
        apiClient.get<UserProfile>("/api/user")
            .then(user => {
                if (user && user.educationStage) {
                    setEducationStage(user.educationStage);
                }
            })
            .catch(err => console.error("Failed to fetch user info:", err));

        if (params.id) {
            fetchItem(params.id as string);
        }
    }, [params.id]);

    const fetchItem = async (id: string) => {
        try {
            const data = await apiClient.get<ErrorItemDetail>(`/api/error-items/${id}`);
            setItem(data);

            const imageKey = getResolvableImageKey(data);
            if (imageKey && !isHttpUrl(data.originalImageUrl)) {
                void apiClient
                    .get<ErrorItemDetail>(`/api/error-items/${id}?includeSignedImage=1`)
                    .then((signedData) => {
                        if (!signedData || !isHttpUrl(signedData.originalImageUrl)) return;
                        setItem((prev) => {
                            if (!prev || prev.id !== id) return prev;
                            return {
                                ...prev,
                                originalImageUrl: signedData.originalImageUrl,
                                displayImageKey: signedData.displayImageKey || imageKey,
                            };
                        });
                    })
                    .catch((signError) => {
                        console.warn("[ErrorDetail] Failed to fetch signed image URL", signError);
                    });
            }
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.loadFailed || 'Failed to load item');
            router.push("/notebooks");
        } finally {
            setLoading(false);
        }
    };

    const toggleMastery = async () => {
        if (!item) return;

        const newLevel = item.masteryLevel > 0 ? 0 : 1;

        try {
            await apiClient.patch(`/api/error-items/${item.id}/mastery`, { masteryLevel: newLevel });
            setItem({ ...item, masteryLevel: newLevel });
            alert(newLevel > 0 ? (t.common?.messages?.markMastered || 'Marked as mastered') : (t.common?.messages?.unmarkMastered || 'Unmarked'));
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.updateFailed || 'Update failed');
        }
    };

    const deleteItem = async () => {
        if (!item) return;

        const confirmMessage = t.common?.messages?.confirmDelete || 'Are you sure you want to delete this error item?';
        if (!confirm(confirmMessage)) return;

        try {
            await apiClient.delete(`/api/error-items/${item.id}/delete`);
            alert(t.common?.messages?.deleteSuccess || 'Deleted successfully');
            if (item.subjectId) {
                router.push(`/notebooks/${item.subjectId}`);
            } else {
                router.push('/notebooks');
            }
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.deleteFailed || 'Delete failed');
        }
    };

    const startEditingTags = () => {
        if (item) {
            // 浼樺厛浣跨敤鏂扮殑 tags 鍏宠仈
            if (item.tags && item.tags.length > 0) {
                setTagsInput(item.tags.map(t => t.name));
            } else if (item.knowledgePoints) {
                // 鍥為€€鍒版棫鐨?knowledgePoints 瀛楁
                try {
                    const tags = JSON.parse(item.knowledgePoints);
                    setTagsInput(tags);
                } catch {
                    setTagsInput([]);
                }
            } else {
                setTagsInput([]);
            }
            setIsEditingTags(true);
        }
    };

    const saveTagsHandler = async () => {
        if (!item || isSavingTags) return;

        setIsSavingTags(true);
        try {
            // 鐩存帴浼犻€掓爣绛惧悕绉版暟缁勶紝鍚庣浼氬鐞嗗叧鑱?
            await apiClient.put(`/api/error-items/${item.id}`, {
                knowledgePoints: tagsInput, // 鍚庣鎺ユ敹鏁扮粍
            });

            setIsEditingTags(false);
            await fetchItem(params.id as string);
            alert(t.common?.messages?.tagUpdateSuccess || 'Tags updated successfully!');
        } catch (error) {
            console.error("[Frontend] Error updating:", error);
            alert(t.common?.messages?.updateFailed || 'Update failed');
        } finally {
            setIsSavingTags(false);
        }
    };

    const cancelEditingTags = () => {
        setIsEditingTags(false);
        setTagsInput([]);
    };

    const startEditingMetadata = () => {
        if (item) {
            setGradeSemesterInput(item.gradeSemester || "");
            setPaperLevelInput(item.paperLevel || "a");
            setIsEditingMetadata(true);
        }
    };

    const saveMetadataHandler = async () => {
        if (!item || isSavingMetadata) return;

        setIsSavingMetadata(true);
        try {
            await apiClient.put(`/api/error-items/${item.id}`, {
                gradeSemester: gradeSemesterInput,
                paperLevel: paperLevelInput,
            });

            setItem({
                ...item,
                gradeSemester: gradeSemesterInput,
                paperLevel: paperLevelInput,
            });

            await fetchItem(item.id);
            setIsEditingMetadata(false);
            alert(t.common?.messages?.metaUpdateSuccess || 'Metadata updated successfully!');
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.updateFailed || 'Update failed');
        } finally {
            setIsSavingMetadata(false);
        }
    };

    const cancelEditingMetadata = () => {
        setIsEditingMetadata(false);
        setGradeSemesterInput("");
        setPaperLevelInput("a");
    };

    const startEditingRootCause = () => {
        const structured = normalizeStructuredQuestionJson(item?.structuredJson);
        setRootCauseInput(structured?.rootCause.confirmedCause || "");
        setIsEditingRootCause(true);
    };

    const cancelEditingRootCause = () => {
        setIsEditingRootCause(false);
        setRootCauseInput("");
    };

    const saveRootCauseHandler = async () => {
        if (!item) return;

        const currentStructured = normalizeStructuredQuestionJson(item.structuredJson);
        if (!currentStructured) {
            alert(t.common?.messages?.saveFailed || "Save failed");
            return;
        }

        const nextStructured: StructuredQuestionJson = {
            ...currentStructured,
            rootCause: {
                ...currentStructured.rootCause,
                confirmedCause: rootCauseInput.trim(),
            },
        };

        try {
            await apiClient.put(`/api/error-items/${item.id}`, {
                structuredJson: nextStructured,
            });
            setItem({
                ...item,
                structuredJson: nextStructured,
            });
            setIsEditingRootCause(false);
            alert(t.common?.messages?.saveSuccess || "Saved successfully");
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.saveFailed || "Save failed");
        }
    };

    const [isEditingQuestion, setIsEditingQuestion] = useState(false);
    const [questionInput, setQuestionInput] = useState("");

    // --- Question Handlers ---
    const startEditingQuestion = () => {
        if (item) {
            setQuestionInput(item.questionText);
            setIsEditingQuestion(true);
        }
    };

    const saveQuestionHandler = async () => {
        if (!item || isSavingQuestion) return;

        setIsSavingQuestion(true);
        try {
            await apiClient.put(`/api/error-items/${item.id}`, { questionText: questionInput });

            const currentStructured = normalizeStructuredQuestionJson(item.structuredJson);
            setItem({
                ...item,
                questionText: questionInput,
                structuredJson: currentStructured
                    ? {
                        ...currentStructured,
                        problem: {
                            ...currentStructured.problem,
                            question_markdown: questionInput,
                        },
                    }
                    : item.structuredJson,
            });

            await fetchItem(item.id);
            setIsEditingQuestion(false);
            alert(t.common?.messages?.saveSuccess || 'Saved successfully');
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.saveFailed || 'Save failed');
        } finally {
            setIsSavingQuestion(false);
        }
    };

    const cancelEditingQuestion = () => {
        setIsEditingQuestion(false);
        setQuestionInput("");
    };

    const startEditingSolution = () => {
        const structured = normalizeStructuredQuestionJson(item?.structuredJson);
        if (!structured) {
            alert(t.common?.messages?.saveFailed || "Save failed");
            return;
        }

        setSolutionFinalAnswerInput(structured.solution.finalAnswer || "");
        setSolutionStepsInput(linesToText(structured.solution.steps));
        setIsEditingSolution(true);
    };

    const cancelEditingSolution = () => {
        setIsEditingSolution(false);
        setSolutionFinalAnswerInput("");
        setSolutionStepsInput("");
    };

    const saveSolutionHandler = async () => {
        if (!item) return;
        const structured = normalizeStructuredQuestionJson(item.structuredJson);
        if (!structured) {
            alert(t.common?.messages?.saveFailed || "Save failed");
            return;
        }

        const finalAnswer = solutionFinalAnswerInput.trim();
        const nextStructured: StructuredQuestionJson = {
            ...structured,
            solution: {
                ...structured.solution,
                finalAnswer,
                steps: textToLines(solutionStepsInput),
            },
        };

        try {
            await apiClient.put(`/api/error-items/${item.id}`, {
                answerText: finalAnswer,
                structuredJson: nextStructured,
            });
            setItem({
                ...item,
                answerText: finalAnswer,
                structuredJson: nextStructured,
            });
            setIsEditingSolution(false);
            alert(t.common?.messages?.saveSuccess || "Saved successfully");
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.saveFailed || "Save failed");
        }
    };

    const startEditingMistake = () => {
        const structured = normalizeStructuredQuestionJson(item?.structuredJson);
        if (!structured) {
            alert(t.common?.messages?.saveFailed || "Save failed");
            return;
        }

        setMistakeStudentStepsInput(linesToText(structured.mistake.studentSteps));
        setMistakeWrongStepIndexInput(toOneBasedIndex(structured.mistake.wrongStepIndex));
        setMistakeWhyWrongInput(structured.mistake.whyWrong || "");
        setMistakeFixSuggestionInput(structured.mistake.fixSuggestion || "");
        setIsEditingMistake(true);
    };

    const cancelEditingMistake = () => {
        setIsEditingMistake(false);
        setMistakeStudentStepsInput("");
        setMistakeWrongStepIndexInput("");
        setMistakeWhyWrongInput("");
        setMistakeFixSuggestionInput("");
    };

    const saveMistakeHandler = async () => {
        if (!item) return;
        const structured = normalizeStructuredQuestionJson(item.structuredJson);
        if (!structured) {
            alert(t.common?.messages?.saveFailed || "Save failed");
            return;
        }

        const nextStructured: StructuredQuestionJson = {
            ...structured,
            mistake: {
                ...structured.mistake,
                studentSteps: textToLines(mistakeStudentStepsInput),
                wrongStepIndex: (() => {
                    const oneBased = toNullableInt(mistakeWrongStepIndexInput);
                    return oneBased ? oneBased - 1 : null;
                })(),
                whyWrong: mistakeWhyWrongInput.trim(),
                fixSuggestion: mistakeFixSuggestionInput.trim(),
            },
        };

        try {
            await apiClient.put(`/api/error-items/${item.id}`, {
                structuredJson: nextStructured,
            });
            setItem({
                ...item,
                structuredJson: nextStructured,
            });
            setIsEditingMistake(false);
            alert(t.common?.messages?.saveSuccess || "Saved successfully");
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.saveFailed || "Save failed");
        }
    };

    if (loading) return <div className="p-8 text-center">{t.common.loading}</div>;
    if (!item) return <div className="p-8 text-center">{t.detail.notFound || "Item not found"}</div>;

    // 浼樺厛浠?tags 鍏宠仈鑾峰彇锛屽洖閫€鍒?knowledgePoints
    let tags: string[] = [];
    if (item.tags && item.tags.length > 0) {
        tags = item.tags.map(t => t.name);
    } else if (item.knowledgePoints) {
        try {
            const parsed = JSON.parse(item.knowledgePoints);
            tags = Array.isArray(parsed) ? parsed : [];
        } catch {
            tags = [];
        }
    }

    const structured = normalizeStructuredQuestionJson(item.structuredJson);
    const solutionFinalAnswer = structured?.solution.finalAnswer || "";
    const solutionStepsText = linesToText(structured?.solution.steps);
    const mistakeStudentStepsText = linesToText(structured?.mistake.studentSteps);
    const mistakeWrongStepIndex = toOneBasedIndex(structured?.mistake.wrongStepIndex);
    const mistakeWhyWrong = structured?.mistake.whyWrong || "";
    const mistakeFixSuggestion = structured?.mistake.fixSuggestion || "";
    const confirmedRootCause = structured?.rootCause.confirmedCause?.trim() || "";

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto p-4 space-y-6 pb-20">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <Link href={item.subjectId ? `/notebooks/${item.subjectId}` : "/notebooks"}>
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="w-4 h-4" />
                            </Button>
                        </Link>
                        <h1 className="text-2xl font-bold">{t.detail.title}</h1>
                    </div>

                    <div className="flex gap-2">
                        <Link href={`/practice?id=${item.id}`}>
                            <Button variant="outline" size="sm">
                                <RefreshCw className="mr-2 h-4 w-4" />
                                {t.detail.practice}
                            </Button>
                        </Link>
                        <Button
                            size="sm"
                            variant={item.masteryLevel > 0 ? "default" : "default"}
                            className={item.masteryLevel > 0 ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                            onClick={toggleMastery}
                        >
                            {item.masteryLevel > 0 ? (
                                <>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    {t.detail.mastered}
                                </>
                            ) : (
                                <>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    {t.detail.markMastered}
                                </>
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={deleteItem}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t.detail.delete || "Delete"}
                        </Button>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Top Row: Question spans both columns */}
                    <div className="min-w-0 lg:col-span-2">
                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>{`题号：${item.questionNo}`}</CardTitle>
                                    {!isEditingQuestion && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={startEditingQuestion}
                                        >
                                            <Edit className="h-4 w-4 mr-1" />
                                            {t.common?.edit || 'Edit'}
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {item.originalImageUrl && (
                                    <div
                                        className="cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={() => setIsImageViewerOpen(true)}
                                        title={t.detail?.clickToView || 'Click to view full image'}
                                    >
                                        <p className="text-sm font-medium mb-2 text-muted-foreground">
                                            {t.detail.originalProblem || "Original Problem"}
                                        </p>
                                        <img
                                            src={item.originalImageUrl}
                                            alt={t.detail.originalProblem || "Original Problem"}
                                            className="w-full rounded-lg border hover:border-primary/50 transition-colors"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1 text-center">
                                            {t.detail?.clickToEnlarge || 'Click to enlarge'}
                                        </p>
                                    </div>
                                )}

                                {isEditingQuestion ? (
                                    <div className="space-y-3">
                                        <Textarea
                                            value={questionInput}
                                            onChange={(e) => setQuestionInput(e.target.value)}
                                            placeholder="Enter question text..." // Consider localizing later
                                            rows={8}
                                            className="w-full font-mono text-sm"
                                        />
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={saveQuestionHandler} disabled={isSavingQuestion}>
                                                <Save className="h-4 w-4 mr-1" />
                                                {isSavingQuestion ? (t.common?.pleaseWait || "Please wait...") : (t.common?.save || 'Save')}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={cancelEditingQuestion} disabled={isSavingQuestion}>
                                                <X className="h-4 w-4 mr-1" />
                                                {t.common?.cancel || 'Cancel'}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <MarkdownRenderer content={item.questionText} />
                                )}

                                {/* 鐭ヨ瘑鐐规爣绛?*/}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-sm font-semibold">{t.editor?.tags || 'Knowledge Tags'}</h4>
                                        {!isEditingTags && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={startEditingTags}
                                            >
                                                <Edit className="h-4 w-4 mr-1" />
                                                {t.common?.edit || 'Edit'}
                                            </Button>
                                        )}
                                    </div>

                                    {isEditingTags ? (
                                        <div className="space-y-3">
                                            <TagInput
                                                value={tagsInput}
                                                onChange={setTagsInput}
                                                placeholder={t.editor?.tagsPlaceholder || 'Enter or select knowledge tags...'}
                                                subject={inferSubjectFromName(item.subject?.name || null) || undefined}
                                                gradeStage={educationStage}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                {t.editor?.tagsHint || 'Select from standard or custom tags'}
                                            </p>
                                            <div className="flex gap-2">
                                                <Button size="sm" onClick={saveTagsHandler} disabled={isSavingTags}>
                                                    <Save className="h-4 w-4 mr-1" />
                                                    {isSavingTags ? (t.common?.pleaseWait || "Please wait...") : (t.common?.save || 'Save')}
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={cancelEditingTags} disabled={isSavingTags}>
                                                    <X className="h-4 w-4 mr-1" />
                                                    {t.common?.cancel || 'Cancel'}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {tags.map((tag) => (
                                                <Badge key={tag} variant="secondary">
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 骞寸骇/瀛︽湡 鍜?璇曞嵎绛夌骇 */}
                                <div className="space-y-2 pt-4 border-t">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-sm font-semibold">
                                            {t.detail?.questionInfo || 'Question Info'}
                                        </h4>
                                        {!isEditingMetadata && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={startEditingMetadata}
                                            >
                                                <Edit className="h-4 w-4 mr-1" />
                                                {t.common?.edit || 'Edit'}
                                            </Button>
                                        )}
                                    </div>

                                    {isEditingMetadata ? (
                                        <div className="space-y-3">
                                            <div className="space-y-2">
                                                <label className="text-sm text-muted-foreground">
                                                    {t.filter.grade}
                                                </label>
                                                <Input
                                                    value={gradeSemesterInput}
                                                    onChange={(e) => setGradeSemesterInput(e.target.value)}
                                                    placeholder={t.notebook?.gradeSemesterPlaceholder || 'e.g. Grade 7, Semester 1'}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm text-muted-foreground">
                                                    {t.filter.paperLevel}
                                                </label>
                                                <Select
                                                    value={paperLevelInput}
                                                    onValueChange={setPaperLevelInput}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="a">{t.editor.paperLevels?.a || 'Paper A'}</SelectItem>
                                                        <SelectItem value="b">{t.editor.paperLevels?.b || 'Paper B'}</SelectItem>
                                                        <SelectItem value="other">{t.editor.paperLevels?.other || 'Other'}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button size="sm" onClick={saveMetadataHandler} disabled={isSavingMetadata}>
                                                    <Save className="h-4 w-4 mr-1" />
                                                    {isSavingMetadata ? (t.common?.pleaseWait || "Please wait...") : (t.common?.save || 'Save')}
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={cancelEditingMetadata} disabled={isSavingMetadata}>
                                                    <X className="h-4 w-4 mr-1" />
                                                    {t.common?.cancel || 'Cancel'}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">{t.filter.grade}:</span>
                                                <span className="font-medium">
                                                    {item.gradeSemester || (t.common?.notSet || 'Not set')}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">{t.filter.paperLevel}:</span>
                                                <span className="font-medium">
                                                    {item.paperLevel ? (t.editor.paperLevels?.[item.paperLevel as 'a' | 'b' | 'other'] || item.paperLevel) : (t.common?.notSet || 'Not set')}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                    </div>

                    {/* Bottom Left: G */}
                    <div className="space-y-6 min-w-0">
                        {!structured && (
                            <Card>
                                <CardContent className="pt-6">
                                    <p className="text-sm text-muted-foreground">
                                        {t.common?.messages?.loadFailed || "Structured data is missing"}
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>{t.editor.standardSolution || "G Standard Solution"}</CardTitle>
                                    {!isEditingSolution && structured && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={startEditingSolution}
                                        >
                                            <Edit className="h-4 w-4 mr-1" />
                                            {t.common?.edit || 'Edit'}
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isEditingSolution && structured ? (
                                    <div className="space-y-3">
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium">
                                                {t.editor.standardAnswer || "Standard Answer"}
                                            </h4>
                                            <Textarea
                                                value={solutionFinalAnswerInput}
                                                onChange={(e) => setSolutionFinalAnswerInput(e.target.value)}
                                                className="min-h-[90px] font-mono text-sm"
                                                placeholder={t.editor.placeholder || "Supports Markdown and LaTeX..."}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium">
                                                {t.editor.solutionSteps || "Step-by-Step Solution"}
                                            </h4>
                                            <Textarea
                                                value={solutionStepsInput}
                                                onChange={(e) => setSolutionStepsInput(e.target.value)}
                                                className="min-h-[220px] font-mono text-sm"
                                                placeholder={t.editor.solutionStepsPlaceholder || "One step per line"}
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={saveSolutionHandler}>
                                                <Save className="h-4 w-4 mr-1" />
                                                {t.common?.save || "Save"}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={cancelEditingSolution}>
                                                <X className="h-4 w-4 mr-1" />
                                                {t.common?.cancel || "Cancel"}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium">
                                                {t.editor.standardAnswer || "Standard Answer"}
                                            </h4>
                                            <div className="min-h-[90px] rounded-md border bg-muted/20 p-3">
                                                <MarkdownRenderer content={normalizeMathLine(solutionFinalAnswer || "")} />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium">
                                                {t.editor.solutionSteps || "Step-by-Step Solution"}
                                            </h4>
                                            <div className="min-h-[220px] rounded-md border bg-muted/20 p-3">
                                                <CompactNumberedSteps
                                                    steps={textToLines(solutionStepsText)}
                                                    normalizeStep={normalizeMathLine}
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>

                    </div>

                    {/* Bottom Right: H + I */}
                    <div className="space-y-6 min-w-0">

                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>{t.editor.errorLocalization || "H Error Localization"}</CardTitle>
                                    {!isEditingMistake && structured && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={startEditingMistake}
                                        >
                                            <Edit className="h-4 w-4 mr-1" />
                                            {t.common?.edit || 'Edit'}
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isEditingMistake && structured ? (
                                    <div className="space-y-3">
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium">{t.editor.studentSteps || "Student Steps"}</h4>
                                            <Textarea
                                                value={mistakeStudentStepsInput}
                                                onChange={(e) => setMistakeStudentStepsInput(e.target.value)}
                                                className="min-h-[140px] font-mono text-sm"
                                                placeholder={t.editor.solutionStepsPlaceholder || "One step per line"}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium">
                                                {t.editor.wrongStepIndex || "Wrong Step Index (1-based)"}
                                            </h4>
                                            <Input
                                                value={mistakeWrongStepIndexInput}
                                                onChange={(e) => setMistakeWrongStepIndexInput(e.target.value)}
                                                inputMode="numeric"
                                                placeholder="e.g. 2"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium">{t.editor.whyWrong || "Why Wrong"}</h4>
                                            <Textarea
                                                value={mistakeWhyWrongInput}
                                                onChange={(e) => setMistakeWhyWrongInput(e.target.value)}
                                                className="min-h-[90px]"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium">{t.editor.fixSuggestion || "How to Fix"}</h4>
                                            <Textarea
                                                value={mistakeFixSuggestionInput}
                                                onChange={(e) => setMistakeFixSuggestionInput(e.target.value)}
                                                className="min-h-[90px]"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={saveMistakeHandler}>
                                                <Save className="h-4 w-4 mr-1" />
                                                {t.common?.save || "Save"}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={cancelEditingMistake}>
                                                <X className="h-4 w-4 mr-1" />
                                                {t.common?.cancel || "Cancel"}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium">{t.editor.studentSteps || "Student Steps"}</h4>
                                            <div className="min-h-[140px] rounded-md border bg-muted/20 p-3">
                                                <CompactNumberedSteps
                                                    steps={textToLines(mistakeStudentStepsText)}
                                                    normalizeStep={(line) => normalizeMathLine(normalizeStepDisplayLine(line))}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium">
                                                {t.editor.wrongStepIndex || "Wrong Step Index (1-based)"}
                                            </h4>
                                            <div className="rounded-md border bg-muted/20 p-3 text-sm">
                                                {mistakeWrongStepIndex.trim() || "-"}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium">{t.editor.whyWrong || "Why Wrong"}</h4>
                                            <div className="min-h-[90px] rounded-md border bg-muted/20 p-3">
                                                <MarkdownRenderer content={normalizeMathLine(mistakeWhyWrong || "")} />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium">{t.editor.fixSuggestion || "How to Fix"}</h4>
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
                                <div className="flex justify-between items-center">
                                    <CardTitle>{t.editor.selfDiagnosis || "I Root-Cause Self Diagnosis"}</CardTitle>
                                    {!isEditingRootCause && structured && (
                                        <Button variant="ghost" size="sm" onClick={startEditingRootCause}>
                                            <Edit className="h-4 w-4 mr-1" />
                                            {t.common?.edit || "Edit"}
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium">
                                        {t.editor.finalRootCause || "Final Root Cause (Confirmed)"}
                                    </h4>
                                </div>
                                {isEditingRootCause && structured ? (
                                    <div className="space-y-3">
                                        <Textarea
                                            value={rootCauseInput}
                                            onChange={(e) => setRootCauseInput(e.target.value)}
                                            placeholder={t.editor.finalRootCausePlaceholder || "Summarize the confirmed root cause"}
                                            rows={4}
                                        />
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={saveRootCauseHandler}>
                                                <Save className="h-4 w-4 mr-1" />
                                                {t.common?.save || "Save"}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={cancelEditingRootCause}>
                                                <X className="h-4 w-4 mr-1" />
                                                {t.common?.cancel || "Cancel"}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="min-h-[90px] rounded-md border bg-muted/20 p-3 text-sm">
                                        {confirmedRootCause}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
{/* Image Viewer Modal */}
            {
                isImageViewerOpen && item?.originalImageUrl && (
                    <div
                        className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
                        onClick={() => setIsImageViewerOpen(false)}
                    >
                        <div className="relative max-w-7xl max-h-full">
                            <button
                                className="absolute -top-12 right-0 text-white hover:text-gray-300 text-lg font-semibold bg-black/50 px-4 py-2 rounded"
                                onClick={() => setIsImageViewerOpen(false)}
                            >
                                {t.detail?.close || 'Close'}
                            </button>
                            <img
                                src={item.originalImageUrl}
                                alt="Full size"
                                className="max-w-full max-h-[90vh] object-contain rounded-lg"
                                onClick={(e) => e.stopPropagation()}
                            />
                            <p className="text-center text-white/70 text-sm mt-4">
                                {t.detail?.clickOutside || 'Click outside to close'}
                            </p>
                        </div>
                    </div>
                )
            }
        </main >
    );
}



