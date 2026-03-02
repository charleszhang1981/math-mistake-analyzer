"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { inferSubjectFromName } from "@/lib/knowledge-tags";

interface TagTreeNode {
    id: string;
    name: string;
    code: string | null;
    isSystem: boolean;
    children: TagTreeNode[];
}

interface KnowledgeFilterProps {
    gradeSemester?: string;
    tag?: string | null;
    subjectName?: string;
    showChapter?: boolean;
    onFilterChange: (filters: {
        gradeSemester?: string;
        chapter?: string;
        tag?: string;
    }) => void;
    className?: string;
}

const GRADE_TO_SEMESTERS: Record<number, string[]> = {
    1: ["一年级"],
    2: ["二年级"],
    3: ["三年级"],
    4: ["四年级"],
    5: ["五年级"],
    6: ["六年级"],
    7: ["七年级上", "七年级下", "七年级"],
    8: ["八年级上", "八年级下", "八年级"],
    9: ["九年级上", "九年级下", "九年级"],
    10: ["高一上", "高一下", "高一"],
    11: ["高二上", "高二下", "高二"],
    12: ["高三上", "高三下", "高三"],
};
const ALL_GRADE_SEMESTERS = [...new Set(Object.values(GRADE_TO_SEMESTERS).flat())];

function getLeafTags(node: TagTreeNode): string[] {
    if (!node.children || node.children.length === 0) {
        return [node.name];
    }

    return node.children.flatMap(getLeafTags);
}

export function KnowledgeFilter({
    gradeSemester: initialGrade,
    tag: initialTag,
    subjectName,
    showChapter = true,
    onFilterChange,
    className,
}: KnowledgeFilterProps) {
    const { t } = useLanguage();
    const [gradeSemester, setGradeSemester] = useState<string>(initialGrade || "");
    const [chapter, setChapter] = useState<string>("");
    const [tag, setTag] = useState<string>(initialTag || "");
    const [tagTree, setTagTree] = useState<TagTreeNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [availableGrades, setAvailableGrades] = useState<string[]>([]);

    useEffect(() => {
        if (initialGrade !== undefined) {
            setGradeSemester(initialGrade || "");
        }
    }, [initialGrade]);

    useEffect(() => {
        if (initialTag !== undefined) {
            setTag(initialTag || "");
        }
    }, [initialTag]);

    const calculateCurrentGrade = useCallback((educationStage: string, enrollmentYear: number): number => {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const academicYear = currentMonth >= 9 ? currentYear : currentYear - 1;
        const yearsInSchool = academicYear - enrollmentYear + 1;

        if (educationStage === "primary") return yearsInSchool;
        if (educationStage === "junior_high") return yearsInSchool + 6;
        if (educationStage === "senior_high") return yearsInSchool + 9;
        return 0;
    }, []);

    const generateAvailableGrades = useCallback((educationStage?: string, enrollmentYear?: number): string[] => {
        let grades: number[];

        if (!educationStage) {
            grades = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        } else if (educationStage === "primary") {
            grades = [1, 2, 3, 4, 5, 6];
        } else if (educationStage === "junior_high") {
            grades = [7, 8, 9];
            if (enrollmentYear) {
                const currentGrade = calculateCurrentGrade(educationStage, enrollmentYear);
                if (currentGrade >= 10) {
                    grades.push(10, 11, 12);
                }
            }
        } else if (educationStage === "senior_high") {
            grades = [10, 11, 12];
        } else {
            grades = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        }

        return grades.flatMap((g) => GRADE_TO_SEMESTERS[g] || []);
    }, [calculateCurrentGrade]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const user = await apiClient.get<{ educationStage?: string; enrollmentYear?: number }>("/api/user");
                setAvailableGrades(generateAvailableGrades(user.educationStage, user.enrollmentYear));

                const subject = subjectName ? inferSubjectFromName(subjectName) : "math";
                const tagData = await apiClient.get<{ tags: TagTreeNode[] }>(`/api/tags?subject=${subject || "math"}`);
                setTagTree(tagData.tags || []);
            } catch (error) {
                console.error("Failed to load knowledge filter data:", error);
                setTagTree([]);
                setAvailableGrades([]);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [subjectName, generateAvailableGrades]);

    const currentGradeNode = useMemo(
        () => tagTree.find((node) => node.name === gradeSemester),
        [tagTree, gradeSemester]
    );

    const chapters = useMemo(
        () => currentGradeNode?.children || [],
        [currentGradeNode]
    );

    const currentChapterNode = useMemo(
        () => chapters.find((node) => node.name === chapter),
        [chapters, chapter]
    );

    const allLeafTags = useMemo(() => {
        const tags = tagTree.flatMap(getLeafTags);
        return [...new Set(tags)];
    }, [tagTree]);

    const tagsByGrade = useMemo(() => {
        if (!currentGradeNode) return allLeafTags;
        return [...new Set(getLeafTags(currentGradeNode))];
    }, [currentGradeNode, allLeafTags]);

    const tagsByChapter = useMemo(() => {
        if (!currentChapterNode) return [];
        return [...new Set(getLeafTags(currentChapterNode))];
    }, [currentChapterNode]);

    const tags = showChapter ? tagsByChapter : tagsByGrade;

    const filteredGrades = useMemo(() => {
        const base = availableGrades.length > 0 ? availableGrades : ALL_GRADE_SEMESTERS;
        if (gradeSemester && !base.includes(gradeSemester)) {
            return [gradeSemester, ...base];
        }
        return base;
    }, [availableGrades, gradeSemester]);

    const handleGradeChange = (value: string) => {
        const nextGrade = value === "all" ? "" : value;
        setGradeSemester(nextGrade);
        setChapter("");
        setTag("");
        onFilterChange({
            gradeSemester: nextGrade || undefined,
            chapter: undefined,
            tag: undefined,
        });
    };

    const handleChapterChange = (value: string) => {
        const nextChapter = value === "all" ? "" : value;
        setChapter(nextChapter);
        setTag("");
        onFilterChange({
            gradeSemester: gradeSemester || undefined,
            chapter: nextChapter || undefined,
            tag: undefined,
        });
    };

    const handleTagChange = (value: string) => {
        const nextTag = value === "all" ? "" : value;
        setTag(nextTag);
        onFilterChange({
            gradeSemester: gradeSemester || undefined,
            chapter: showChapter ? (chapter || undefined) : undefined,
            tag: nextTag || undefined,
        });
    };

    return (
        <div className={`flex flex-wrap gap-2 ${className || ""}`}>
            <Select value={gradeSemester || "all"} onValueChange={handleGradeChange} disabled={loading}>
                <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder={t.filter.grade || "年级/学期"} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">{t.filter.all || "全部"}</SelectItem>
                    {filteredGrades.map((gs) => (
                        <SelectItem key={gs} value={gs}>
                            {gs}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {showChapter && (
                <Select
                    value={chapter || "all"}
                    onValueChange={handleChapterChange}
                    disabled={!gradeSemester || loading}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="章节" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部章节</SelectItem>
                        {chapters.map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                                {c.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}

            <Select
                value={tag || "all"}
                onValueChange={handleTagChange}
                disabled={loading || tags.length === 0 || (showChapter && !chapter)}
            >
                <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="知识点" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">{t.filter.all || "全部"}</SelectItem>
                    {tags.map((tagName) => (
                        <SelectItem key={tagName} value={tagName}>
                            {tagName}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
