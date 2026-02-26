"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Home } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { cleanMarkdown } from "@/lib/markdown-utils";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ReviewListResponse, ReviewQueueItem } from "@/types/api";

type GroupMode = "cause" | "tag";

export default function ReviewPage() {
    const { t } = useLanguage();
    const [items, setItems] = useState<ReviewQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);
    const [dueOnly, setDueOnly] = useState(true);
    const [groupMode, setGroupMode] = useState<GroupMode>("cause");
    const [notesByItem, setNotesByItem] = useState<Record<string, string>>({});

    const fetchReviewItems = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get<ReviewListResponse>(`/api/review/list?dueOnly=${dueOnly}`);
            setItems(response.items);
        } catch (error) {
            console.error("Failed to load review list:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReviewItems();
    }, [dueOnly]);

    const groupedItems = useMemo(() => {
        const groups = new Map<string, ReviewQueueItem[]>();

        for (const item of items) {
            if (groupMode === "cause") {
                const key = item.cause || "Uncategorized";
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(item);
                continue;
            }

            const tags = item.tags.length > 0 ? item.tags : ["Untagged"];
            for (const tag of tags) {
                if (!groups.has(tag)) groups.set(tag, []);
                groups.get(tag)!.push(item);
            }
        }

        return Array.from(groups.entries())
            .map(([key, groupItems]) => ({ key, items: groupItems }))
            .sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key));
    }, [items, groupMode]);

    const handleRecord = async (errorItemId: string, isCorrect: boolean) => {
        setSubmittingItemId(errorItemId);
        try {
            await apiClient.post("/api/review/record", {
                errorItemId,
                isCorrect,
                reviewNote: notesByItem[errorItemId] || undefined,
            });

            setNotesByItem((prev) => {
                const next = { ...prev };
                delete next[errorItemId];
                return next;
            });

            await fetchReviewItems();
        } catch (error) {
            console.error("Failed to record review:", error);
            alert(t.common?.messages?.saveFailed || "Failed to save");
        } finally {
            setSubmittingItemId(null);
        }
    };

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-start gap-4">
                    <BackButton fallbackUrl="/" />
                    <div className="flex-1 space-y-1">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.notebook?.review || "Review"}</h1>
                        <p className="text-muted-foreground text-sm sm:text-base">
                            {dueOnly ? "Showing due items" : "Showing all items"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Link href="/">
                            <Button variant="ghost" size="icon">
                                <Home className="h-5 w-5" />
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button
                        variant={dueOnly ? "default" : "outline"}
                        size="sm"
                        onClick={() => setDueOnly(true)}
                    >
                        Due Only
                    </Button>
                    <Button
                        variant={!dueOnly ? "default" : "outline"}
                        size="sm"
                        onClick={() => setDueOnly(false)}
                    >
                        All
                    </Button>
                    <Button
                        variant={groupMode === "cause" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setGroupMode("cause")}
                    >
                        Group by Cause
                    </Button>
                    <Button
                        variant={groupMode === "tag" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setGroupMode("tag")}
                    >
                        Group by Tag
                    </Button>
                </div>

                {loading ? (
                    <p className="text-muted-foreground">{t.common.loading}</p>
                ) : groupedItems.length === 0 ? (
                    <Card>
                        <CardContent className="py-10 text-center text-muted-foreground">
                            No review items.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-6">
                        {groupedItems.map((group) => (
                            <section key={group.key} className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold">{group.key}</h2>
                                    <Badge variant="secondary">{group.items.length}</Badge>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    {group.items.map((item) => (
                                        <Card key={`${group.key}-${item.errorItemId}`}>
                                            <CardHeader className="space-y-2">
                                                <div className="flex items-center justify-between gap-3">
                                                    <CardTitle className="text-base line-clamp-2">
                                                        {cleanMarkdown(item.questionText || "").slice(0, 120) || "Untitled"}
                                                    </CardTitle>
                                                    <Badge variant={item.isDue ? "destructive" : "outline"}>
                                                        {item.isDue ? "Due" : "Scheduled"}
                                                    </Badge>
                                                </div>

                                                <div className="text-xs text-muted-foreground">
                                                    Next: {format(new Date(item.nextDueAt), "yyyy-MM-dd HH:mm")}
                                                    {item.lastReviewedAt && (
                                                        <> | Last: {format(new Date(item.lastReviewedAt), "yyyy-MM-dd HH:mm")}</>
                                                    )}
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {item.tags.map((tag) => (
                                                        <Badge key={tag} variant="secondary">
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>

                                                {item.lastReviewNote && (
                                                    <div className="rounded-md border bg-muted/40 p-2 text-sm">
                                                        {item.lastReviewNote}
                                                    </div>
                                                )}

                                                <Textarea
                                                    value={notesByItem[item.errorItemId] || ""}
                                                    onChange={(e) => setNotesByItem((prev) => ({
                                                        ...prev,
                                                        [item.errorItemId]: e.target.value,
                                                    }))}
                                                    placeholder="Optional note..."
                                                    rows={2}
                                                />

                                                <div className="flex flex-wrap gap-2">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleRecord(item.errorItemId, true)}
                                                        disabled={submittingItemId === item.errorItemId}
                                                    >
                                                        Correct (+3d)
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => handleRecord(item.errorItemId, false)}
                                                        disabled={submittingItemId === item.errorItemId}
                                                    >
                                                        Incorrect (+1d)
                                                    </Button>
                                                    <Link href={`/error-items/${item.errorItemId}`}>
                                                        <Button size="sm" variant="outline">
                                                            Open Item
                                                        </Button>
                                                    </Link>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
