"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { TagSuggestionsResponse } from "@/types/api";

interface TagInputProps {
    value: string[];
    onChange: (tags: string[]) => void;
    placeholder?: string;
    className?: string;
    enterHint?: string;
    subject?: string;
    gradeStage?: string;
}

export function TagInput({
    value = [],
    onChange,
    placeholder = "Enter tags...",
    className = "",
    enterHint,
    subject,
    gradeStage,
}: TagInputProps) {
    const [input, setInput] = useState("");
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!input.trim()) {
            return;
        }

        let cancelled = false;

        const fetchSuggestions = async () => {
            try {
                const params = new URLSearchParams({ q: input });
                if (subject) {
                    params.append("subject", subject);
                }
                if (gradeStage) {
                    params.append("stage", gradeStage);
                }

                const data = await apiClient.get<TagSuggestionsResponse>(`/api/tags/suggestions?${params.toString()}`);
                if (cancelled) return;

                const filtered = (data.suggestions || []).filter((tag) => !value.includes(tag));
                setSuggestions(filtered.slice(0, 20));
                setShowSuggestions(filtered.length > 0);
                setSelectedIndex(0);
            } catch {
                if (cancelled) return;
                setSuggestions([]);
                setShowSuggestions(false);
                setSelectedIndex(0);
            }
        };

        void fetchSuggestions();

        return () => {
            cancelled = true;
        };
    }, [gradeStage, input, subject, value]);

    const addTag = (tag: string) => {
        if (tag.trim() && !value.includes(tag.trim())) {
            onChange([...value, tag.trim()]);
            setInput("");
            setSuggestions([]);
            setShowSuggestions(false);
            setSelectedIndex(0);
        }
    };

    const removeTag = (tagToRemove: string) => {
        onChange(value.filter((tag) => tag !== tagToRemove));
    };

    const handleInputChange = (nextValue: string) => {
        setInput(nextValue);
        if (!nextValue.trim()) {
            setSuggestions([]);
            setShowSuggestions(false);
            setSelectedIndex(0);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                addTag(suggestions[selectedIndex]);
            } else if (input.trim()) {
                addTag(input);
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Escape") {
            setShowSuggestions(false);
            setSelectedIndex(0);
        } else if (e.key === "Backspace" && !input && value.length > 0) {
            removeTag(value[value.length - 1]);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                suggestionsRef.current &&
                !suggestionsRef.current.contains(event.target as Node) &&
                !inputRef.current?.contains(event.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className={`relative ${className}`}>
            <div className="flex min-h-[42px] flex-wrap gap-2 rounded-lg border bg-background p-2">
                {value.map((tag) => (
                    <Badge key={tag} variant="secondary" className="flex items-center gap-1 px-2 py-1">
                        {tag}
                        <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="ml-1 hover:text-destructive"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                ))}

                <Input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (suggestions.length > 0) {
                            setShowSuggestions(true);
                        }
                    }}
                    placeholder={value.length === 0 ? placeholder : ""}
                    className="h-8 min-w-[120px] flex-1 border-none px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
            </div>

            {showSuggestions && suggestions.length > 0 && (
                <div
                    ref={suggestionsRef}
                    className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow-md"
                >
                    {suggestions.map((suggestion, index) => (
                        <div
                            key={suggestion}
                            className={`cursor-pointer px-3 py-2 hover:bg-accent ${index === selectedIndex ? "bg-accent" : ""}`}
                            onClick={() => addTag(suggestion)}
                            onMouseEnter={() => setSelectedIndex(index)}
                        >
                            {suggestion}
                        </div>
                    ))}
                </div>
            )}

            {input && !showSuggestions && (
                <div className="mt-1 text-xs text-muted-foreground">
                    {enterHint ? `${enterHint} "${input}"` : `Press Enter to create "${input}"`}
                </div>
            )}
        </div>
    );
}
