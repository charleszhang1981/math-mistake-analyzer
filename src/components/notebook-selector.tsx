"use client";

import { useEffect, useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { BookOpen } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Notebook } from "@/types/api";
import { useLanguage } from "@/contexts/LanguageContext";

interface NotebookSelectorProps {
    value?: string;
    onChange: (value: string) => void;
    className?: string;
}

const DEFAULT_NOTEBOOK_ID_KEY = "default-notebook-id";

export function NotebookSelector({ value, onChange, className }: NotebookSelectorProps) {
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [defaultNotebookId, setDefaultNotebookId] = useState<string | null>(null);
    const { t, language } = useLanguage();

    const persistDefaultNotebookId = (id: string) => {
        localStorage.setItem(DEFAULT_NOTEBOOK_ID_KEY, id);
        setDefaultNotebookId(id);
    };

    useEffect(() => {
        const fetchNotebooks = async () => {
            try {
                const data = await apiClient.get<Notebook[]>("/api/notebooks");
                setNotebooks(data);

                if (data.length === 0) {
                    setDefaultNotebookId(null);
                    return;
                }

                const savedDefault = localStorage.getItem(DEFAULT_NOTEBOOK_ID_KEY);
                const savedExists = !!savedDefault && data.some((n) => n.id === savedDefault);
                setDefaultNotebookId(savedExists ? savedDefault! : data[0].id);
            } catch (error) {
                console.error("Failed to fetch notebooks:", error);
            }
        };

        fetchNotebooks();
    }, []);

    useEffect(() => {
        if (notebooks.length === 0) return;

        const valueExists = !!value && notebooks.some((n) => n.id === value);
        if (valueExists) return;

        const defaultExists = !!defaultNotebookId && notebooks.some((n) => n.id === defaultNotebookId);
        const fallbackId = defaultExists ? defaultNotebookId! : notebooks[0].id;

        if (!defaultExists) {
            persistDefaultNotebookId(fallbackId);
        }

        onChange(fallbackId);
    }, [notebooks, value, defaultNotebookId, onChange]);

    const handleValueChange = (nextValue: string) => {
        onChange(nextValue);
        persistDefaultNotebookId(nextValue);
    };

    const defaultLabel = language === "zh" ? "默认" : "Default";

    return (
        <Select value={value} onValueChange={handleValueChange}>
            <SelectTrigger className={className}>
                <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder={t.notebooks?.selector?.placeholder || "Select Notebook"} />
                </div>
            </SelectTrigger>
            <SelectContent>
                {notebooks.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                        {t.notebooks?.selector?.empty || "No notebooks available"}
                    </div>
                ) : (
                    notebooks.map((notebook) => (
                        <SelectItem key={notebook.id} value={notebook.id}>
                            {notebook.id === defaultNotebookId
                                ? `${notebook.name} (${defaultLabel})`
                                : notebook.name}
                        </SelectItem>
                    ))
                )}
            </SelectContent>
        </Select>
    );
}
