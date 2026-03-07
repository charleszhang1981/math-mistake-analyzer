"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Notebook } from "@/types/api";

export default function NotebooksPage() {
    const router = useRouter();
    const { t } = useLanguage();
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const openOnlyNotebook = async () => {
            try {
                const notebooks = await apiClient.get<Notebook[]>("/api/notebooks");
                const targetNotebook = notebooks[0];

                if (!targetNotebook) {
                    if (!cancelled) {
                        setHasError(true);
                    }
                    return;
                }

                router.replace(`/notebooks/${targetNotebook.id}`);
            } catch (error) {
                console.error("Failed to resolve default notebook:", error);
                if (!cancelled) {
                    setHasError(true);
                }
            }
        };

        void openOnlyNotebook();

        return () => {
            cancelled = true;
        };
    }, [router]);

    if (hasError) {
        return (
            <main className="min-h-screen bg-background p-6">
                <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 text-center">
                    <h1 className="text-2xl font-bold">{t.notebooks?.title || "My Notebook"}</h1>
                    <p className="text-sm text-muted-foreground">
                        {t.common?.messages?.loadFailed || "Failed to open notebook"}
                    </p>
                    <Link href="/">
                        <Button>{t.common?.back || "Back"}</Button>
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-background p-6">
            <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center text-sm text-muted-foreground">
                {t.common.loading}
            </div>
        </main>
    );
}
