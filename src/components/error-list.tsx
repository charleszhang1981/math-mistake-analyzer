"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Search, CheckCircle, Clock, Printer, ListChecks, Trash2, X, CheckSquare } from "lucide-react";
import { KnowledgeFilter } from "@/components/knowledge-filter";
import { Pagination } from "@/components/ui/pagination";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { cleanMarkdown } from "@/lib/markdown-utils";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { ErrorItem, PaginatedResponse } from "@/types/api";

interface ErrorListProps {
    subjectId?: string;
    subjectName?: string;
}

type MasteryFilter = "all" | "mastered" | "unmastered";
type TimeFilter = "all" | "week" | "month";
type PaperLevelFilter = "all" | "a" | "b" | "other";
type BatchActionScope = "results" | "selected";

interface SearchFilters {
    query: string;
    mastery: MasteryFilter;
    timeRange: TimeFilter;
    gradeSemester: string;
    tag: string;
    paperLevel: PaperLevelFilter;
}

const DEFAULT_FILTERS: SearchFilters = {
    query: "",
    mastery: "all",
    timeRange: "all",
    gradeSemester: "",
    tag: "",
    paperLevel: "all",
};

function buildListQueryParams(
    filters: SearchFilters,
    subjectId?: string,
    options?: {
        page?: number;
        pageSize?: number;
        ids?: string[];
    }
): URLSearchParams {
    const params = new URLSearchParams();

    if (subjectId) params.append("subjectId", subjectId);

    const query = filters.query.trim();
    if (query) params.append("query", query);

    if (filters.mastery !== "all") {
        params.append("mastery", filters.mastery === "mastered" ? "1" : "0");
    }

    if (filters.timeRange !== "all") {
        params.append("timeRange", filters.timeRange);
    }

    if (filters.gradeSemester) {
        params.append("gradeSemester", filters.gradeSemester);
    }

    if (filters.tag) {
        params.append("tag", filters.tag);
    }

    if (filters.paperLevel !== "all") {
        params.append("paperLevel", filters.paperLevel);
    }

    if (options?.ids && options.ids.length > 0) {
        params.append("ids", options.ids.join(","));
    }

    if (options?.page !== undefined) {
        params.append("page", String(options.page));
    }

    if (options?.pageSize !== undefined) {
        params.append("pageSize", String(options.pageSize));
    }

    return params;
}

export function ErrorList({ subjectId, subjectName }: ErrorListProps = {}) {
    const { t } = useLanguage();
    const router = useRouter();

    const [items, setItems] = useState<ErrorItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [draftFilters, setDraftFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
    const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(DEFAULT_FILTERS);

    const [page, setPage] = useState(1);
    const [pageSize] = useState(DEFAULT_PAGE_SIZE);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [actionScope, setActionScope] = useState<BatchActionScope>("results");
    const [isDeleting, setIsDeleting] = useState(false);

    const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

    const selectedCount = selectedIds.size;

    useEffect(() => {
        if (selectedCount === 0 && actionScope === "selected") {
            setActionScope("results");
        }
    }, [selectedCount, actionScope]);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const params = buildListQueryParams(appliedFilters, subjectId, { page, pageSize });
            const response = await apiClient.get<PaginatedResponse<ErrorItem>>(`/api/error-items/list?${params.toString()}`);
            setItems(response.items);
            setTotal(response.total);
            setTotalPages(response.totalPages);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [appliedFilters, subjectId, page, pageSize]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const applySearch = () => {
        const normalized: SearchFilters = {
            ...draftFilters,
            query: draftFilters.query.trim(),
        };

        setAppliedFilters(normalized);
        setSelectedIds(new Set());
        setActionScope("results");
        setPage(1);
    };

    const resetSearch = () => {
        setDraftFilters(DEFAULT_FILTERS);
        setAppliedFilters(DEFAULT_FILTERS);
        setSelectedIds(new Set());
        setActionScope("results");
        setPage(1);
    };

    const removeAppliedFilter = (key: keyof SearchFilters) => {
        const nextDraft = { ...draftFilters, [key]: DEFAULT_FILTERS[key] };
        const nextApplied = { ...appliedFilters, [key]: DEFAULT_FILTERS[key] };
        setDraftFilters(nextDraft);
        setAppliedFilters(nextApplied);
        setSelectedIds(new Set());
        setActionScope("results");
        setPage(1);
    };

    const handleExportPrint = () => {
        const useSelected = actionScope === "selected" && selectedIds.size > 0;
        const params = buildListQueryParams(appliedFilters, subjectId, {
            ids: useSelected ? Array.from(selectedIds) : undefined,
        });
        router.push(`/print-preview?${params.toString()}`);
    };

    const toggleSelectMode = () => {
        if (isSelectMode) {
            setIsSelectMode(false);
            setSelectedIds(new Set());
            setActionScope("results");
            return;
        }

        setIsSelectMode(true);
    };

    const toggleSelectItem = (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            if (next.size > 0) {
                setActionScope("selected");
            } else {
                setActionScope("results");
            }
            return next;
        });
    };

    const selectCurrentPage = () => {
        setSelectedIds(new Set(items.map((item) => item.id)));
        if (items.length > 0) {
            setActionScope("selected");
        }
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
        setActionScope("results");
    };

    const handleBatchDelete = async () => {
        const useSelected = actionScope === "selected" && selectedIds.size > 0;
        const targetCount = useSelected ? selectedIds.size : total;

        if (targetCount === 0) return;

        const confirmMessage = useSelected
            ? (t.notebook?.confirmBatchDelete || "确定删除 {count} 道错题？").replace("{count}", String(targetCount))
            : "确定删除当前检索结果中的全部 {count} 道错题？".replace("{count}", String(targetCount));

        if (!confirm(confirmMessage)) return;

        setIsDeleting(true);
        try {
            const payload = useSelected
                ? { ids: Array.from(selectedIds) }
                : {
                    filters: {
                        subjectId,
                        query: appliedFilters.query,
                        mastery: appliedFilters.mastery,
                        timeRange: appliedFilters.timeRange,
                        gradeSemester: appliedFilters.gradeSemester,
                        tag: appliedFilters.tag,
                        paperLevel: appliedFilters.paperLevel,
                    },
                };

            const response = await apiClient.post<{ deleted: number }>("/api/error-items/batch-delete", payload);
            const deleted = response?.deleted ?? targetCount;

            alert("已删除 {count} 道错题。".replace("{count}", String(deleted)));

            setSelectedIds(new Set());
            setActionScope("results");

            if (!useSelected) {
                setPage(1);
            } else {
                fetchItems();
            }
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.deleteFailed || "Delete failed");
        } finally {
            setIsDeleting(false);
        }
    };

    const toggleTagsExpanded = (itemId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setExpandedTags((prev) => {
            const next = new Set(prev);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    };

    const applyQuickTag = (tag: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const nextTag = appliedFilters.tag === tag ? "" : tag;
        const nextFilters = { ...appliedFilters, tag: nextTag };
        setDraftFilters(nextFilters);
        setAppliedFilters(nextFilters);
        setSelectedIds(new Set());
        setActionScope("results");
        setPage(1);
    };

    const appliedChips = useMemo(() => {
        const chips: Array<{ key: keyof SearchFilters; label: string }> = [];

        if (appliedFilters.query) {
            chips.push({ key: "query", label: `${t.notebook?.search || "Search"}: ${appliedFilters.query}` });
        }

        if (appliedFilters.mastery !== "all") {
            chips.push({
                key: "mastery",
                label: appliedFilters.mastery === "mastered"
                    ? (t.filter.mastered || "Mastered")
                    : (t.filter.review || "To Review"),
            });
        }

        if (appliedFilters.timeRange !== "all") {
            const timeLabel = appliedFilters.timeRange === "week"
                ? (t.filter.lastWeek || "Last Week")
                : (t.filter.lastMonth || "Last Month");
            chips.push({ key: "timeRange", label: timeLabel });
        }

        if (appliedFilters.gradeSemester) {
            chips.push({ key: "gradeSemester", label: `${t.filter.grade || "Grade"}: ${appliedFilters.gradeSemester}` });
        }

        if (appliedFilters.tag) {
            chips.push({ key: "tag", label: `知识点: ${appliedFilters.tag}` });
        }

        if (appliedFilters.paperLevel !== "all") {
            const paperLabel = t.editor.paperLevels?.[appliedFilters.paperLevel] || appliedFilters.paperLevel;
            chips.push({ key: "paperLevel", label: `${t.filter.paperLevel || "Paper"}: ${paperLabel}` });
        }

        return chips;
    }, [appliedFilters, t]);

    const canRunResultAction = total > 0;
    const canRunSelectedAction = selectedCount > 0;
    const isUsingSelectedScope = actionScope === "selected" && canRunSelectedAction;

    return (
        <div className="space-y-6">
            <Card>
                <CardContent className="space-y-4 pt-6">
                    <div className="flex flex-col lg:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder={t.notebook.search}
                                className="pl-9"
                                value={draftFilters.query}
                                onChange={(e) => setDraftFilters((prev) => ({ ...prev, query: e.target.value }))}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        applySearch();
                                    }
                                }}
                            />
                        </div>
                        <Button onClick={applySearch}>搜索</Button>
                        <Button variant="outline" onClick={resetSearch}>重置</Button>
                    </div>

                    <div className="flex flex-wrap gap-3 items-center">
                        <Select
                            value={draftFilters.mastery}
                            onValueChange={(value: MasteryFilter) => setDraftFilters((prev) => ({ ...prev, mastery: value }))}
                        >
                            <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder={t.filter.masteryStatus || "Mastery"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t.filter.all || "All"}</SelectItem>
                                <SelectItem value="unmastered">{t.filter.review || "To Review"}</SelectItem>
                                <SelectItem value="mastered">{t.filter.mastered || "Mastered"}</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={draftFilters.timeRange}
                            onValueChange={(value: TimeFilter) => setDraftFilters((prev) => ({ ...prev, timeRange: value }))}
                        >
                            <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder={t.filter.timeRange || "Time Range"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t.filter.allTime || "All Time"}</SelectItem>
                                <SelectItem value="week">{t.filter.lastWeek || "Last Week"}</SelectItem>
                                <SelectItem value="month">{t.filter.lastMonth || "Last Month"}</SelectItem>
                            </SelectContent>
                        </Select>

                        <KnowledgeFilter
                            gradeSemester={draftFilters.gradeSemester}
                            tag={draftFilters.tag || null}
                            onFilterChange={({ gradeSemester, tag }) => {
                                setDraftFilters((prev) => ({
                                    ...prev,
                                    gradeSemester: gradeSemester || "",
                                    tag: tag || "",
                                }));
                            }}
                            subjectName={subjectName}
                            showChapter={false}
                        />

                        <Select
                            value={draftFilters.paperLevel}
                            onValueChange={(value: PaperLevelFilter) => setDraftFilters((prev) => ({ ...prev, paperLevel: value }))}
                        >
                            <SelectTrigger className="w-[140px]">
                                <SelectValue placeholder={t.filter.paperLevel || "Paper"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t.filter.all || "All"}</SelectItem>
                                <SelectItem value="a">{t.editor.paperLevels?.a || "Paper A"}</SelectItem>
                                <SelectItem value="b">{t.editor.paperLevels?.b || "Paper B"}</SelectItem>
                                <SelectItem value="other">{t.editor.paperLevels?.other || "Other"}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {appliedChips.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                            {appliedChips.map((chip) => (
                                <Badge key={chip.key} variant="secondary" className="flex items-center gap-1 px-2 py-1">
                                    {chip.label}
                                    <button
                                        type="button"
                                        onClick={() => removeAppliedFilter(chip.key)}
                                        className="hover:text-destructive"
                                        aria-label="remove filter"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))}
                            <Button variant="ghost" size="sm" onClick={resetSearch}>
                                清空条件
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-muted-foreground">
                    {(t.notebooks?.totalErrors || "Total {count} errors").replace("{count}", String(total))}
                    {isSelectMode && ` · ${(t.notebook?.selectedCount || "{count} selected").replace("{count}", String(selectedCount))}`}
                </div>

                <div className="flex flex-wrap gap-2">
                    {isSelectMode && (
                        <>
                            <Button variant="outline" size="sm" onClick={selectCurrentPage} disabled={items.length === 0}>
                                <CheckSquare className="mr-2 h-4 w-4" />
                                本页全选
                            </Button>
                            <Button variant="outline" size="sm" onClick={clearSelection} disabled={selectedCount === 0}>
                                <X className="mr-2 h-4 w-4" />
                                清空选择
                            </Button>
                        </>
                    )}

                    {selectedCount > 0 && (
                        <div className="inline-flex">
                            <Button
                                size="sm"
                                className={actionScope === "results" ? "rounded-r-none bg-secondary hover:bg-secondary/90" : "rounded-r-none"}
                                variant="outline"
                                onClick={() => setActionScope("results")}
                            >
                                全部({total})
                            </Button>
                            <Button
                                size="sm"
                                className={actionScope === "selected" ? "rounded-l-none -ml-px bg-secondary hover:bg-secondary/90" : "rounded-l-none -ml-px"}
                                variant="outline"
                                onClick={() => setActionScope("selected")}
                            >
                                已选({selectedCount})
                            </Button>
                        </div>
                    )}

                    <Button
                        variant={isSelectMode ? "secondary" : "outline"}
                        size="sm"
                        onClick={toggleSelectMode}
                    >
                        <ListChecks className="mr-2 h-4 w-4" />
                        {isSelectMode ? (t.notebook?.cancelSelect || "Cancel") : (t.notebook?.selectMode || "Select")}
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportPrint}
                        disabled={isUsingSelectedScope ? !canRunSelectedAction : !canRunResultAction}
                    >
                        <Printer className="mr-2 h-4 w-4" />
                        {t.notebook?.exportPrint || "Export for Print"}
                    </Button>

                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleBatchDelete}
                        disabled={isDeleting || (isUsingSelectedScope ? !canRunSelectedAction : !canRunResultAction)}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isUsingSelectedScope
                            ? (t.notebook?.deleteSelected || "Delete Selected")
                            : "删除检索结果"}
                    </Button>
                </div>
            </div>

            {loading && items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">{t.common.loading}</div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((item) => {
                        let tags: string[] = [];
                        if (item.tags && item.tags.length > 0) {
                            tags = item.tags.map((tag) => tag.name);
                        } else if (item.knowledgePoints) {
                            try {
                                const parsed = JSON.parse(item.knowledgePoints);
                                tags = Array.isArray(parsed) ? parsed : [];
                            } catch {
                                tags = [];
                            }
                        }

                        const isChecked = selectedIds.has(item.id);

                        return (
                            <div key={item.id} className="relative">
                                {isSelectMode && (
                                    <div className="absolute top-2 left-2 z-10" onClick={(e) => toggleSelectItem(item.id, e)}>
                                        <Checkbox checked={isChecked} className="h-5 w-5 border-2 bg-background shadow-sm" />
                                    </div>
                                )}

                                <Link
                                    href={isSelectMode ? "#" : `/error-items/${item.id}`}
                                    onClick={(e) => {
                                        if (isSelectMode) {
                                            e.preventDefault();
                                            toggleSelectItem(item.id, e);
                                        }
                                    }}
                                >
                                    <Card className="h-full cursor-pointer gap-2 pt-4 transition-colors hover:border-primary/50">
                                        <CardHeader className="pb-0">
                                            <div className="flex items-start justify-between">
                                                <Badge
                                                    variant={item.masteryLevel > 0 ? "default" : "secondary"}
                                                    className={item.masteryLevel > 0 ? "bg-green-600 hover:bg-green-700" : ""}
                                                >
                                                    {item.masteryLevel > 0 ? (
                                                        <span className="flex items-center gap-1">
                                                            <CheckCircle className="h-3 w-3" /> {t.notebook.mastered}
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" /> {t.notebook.review}
                                                        </span>
                                                    )}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    {format(new Date(item.createdAt), "MM/dd")}
                                                </span>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="line-clamp-3 text-sm">
                                                {(() => {
                                                    const rawText = (item.questionText || "").split("\n\n")[0];
                                                    const cleanText = cleanMarkdown(rawText);
                                                    return cleanText.length > 80 ? `${cleanText.substring(0, 80)}...` : cleanText;
                                                })()}
                                            </div>

                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {(expandedTags.has(item.id) ? tags : tags.slice(0, 3)).map((tag) => (
                                                    <Badge
                                                        key={tag}
                                                        variant={appliedFilters.tag === tag ? "default" : "outline"}
                                                        className="cursor-pointer text-xs transition-colors hover:bg-primary/10"
                                                        onClick={(e) => applyQuickTag(tag, e)}
                                                    >
                                                        {tag}
                                                    </Badge>
                                                ))}

                                                {tags.length > 3 && (
                                                    <Badge
                                                        variant="secondary"
                                                        className="cursor-pointer text-xs transition-colors hover:bg-secondary/80"
                                                        onClick={(e) => toggleTagsExpanded(item.id, e)}
                                                    >
                                                        {expandedTags.has(item.id)
                                                            ? (t.notebooks?.collapseTags || "Collapse")
                                                            : (t.notebooks?.expandTags || "+{count} more").replace("{count}", String(tags.length - 3))}
                                                    </Badge>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            </div>
                        );
                    })}
                </div>
            )}

            {!loading && items.length === 0 && (
                <Card>
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        没有符合当前检索条件的题目。
                    </CardContent>
                </Card>
            )}

            <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
            />
        </div>
    );
}
