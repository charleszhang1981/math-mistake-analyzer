import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
    content: string;
    className?: string;
    compact?: boolean;
    inlineParagraphs?: boolean;
}

const MATH_COMMANDS =
    "frac|sqrt|times|div|cdot|left|right|leq|geq|neq|pm|mp|sin|cos|tan|log|ln|pi|theta|alpha|beta|gamma|delta|sum|prod|int|overline|underline|text|boxed|begin|end|to|infty";

function wrapBareLatexLine(line: string): string {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (/[`$]/.test(trimmed) || /\\\(|\\\[/.test(trimmed)) return line;

    const hasLatexCommand = /\\[a-zA-Z]+/.test(trimmed);
    if (!hasLatexCommand) return line;

    const naturalText = trimmed
        .replace(/\\[a-zA-Z]+/g, "")
        .replace(/[{}\[\]()0-9+\-*/^_=.,:，。；：！？\s]/g, "");
    if (/[A-Za-z\u4e00-\u9fff]/.test(naturalText)) return line;

    return `$${trimmed}$`;
}

export function MarkdownRenderer({
    content,
    className = '',
    compact = false,
    inlineParagraphs = false,
}: MarkdownRendererProps) {
    const wrapperClassName = compact
        ? `markdown-content min-w-0 overflow-visible ${className}`
        : `markdown-content overflow-x-auto min-w-0 ${className}`;
    const paragraphClassName = compact
        ? `${inlineParagraphs ? "m-0 inline leading-snug" : "mb-0 leading-snug"}`
        : "mb-3 leading-relaxed";
    const unorderedListClassName = compact
        ? "list-disc list-inside mb-0 space-y-0.5"
        : "list-disc list-inside mb-3 space-y-1";
    const orderedListClassName = compact
        ? "list-decimal list-inside mb-0 space-y-0.5"
        : "list-decimal list-inside mb-3 space-y-1";
    const listItemClassName = compact ? "ml-4 leading-snug" : "ml-4";

    const normalizedMathContent = content
        // AI sometimes emits escaped delimiters; normalize so KaTeX can parse.
        .replace(/\\\$/g, "$")
        // Handle over-escaped math commands like \\frac -> \frac.
        .replace(new RegExp(String.raw`\\\\(?=(${MATH_COMMANDS})\b)`, "g"), "\\")
        // AI often emits \left/\right with mismatched pairs; drop wrappers for stable rendering.
        .replace(/\\left\b\s*/g, "")
        .replace(/\\right\b\s*/g, "")
        // Inline math with line breaks can trigger KaTeX parse errors; collapse inside $...$.
        .replace(/\$([\s\S]*?)\$/g, (_match, body: string) => {
            const compact = body.replace(/\r?\n+/g, " ").replace(/\s{2,}/g, " ").trim();
            return `$${compact}$`;
        });

    const mathWrappedContent = normalizedMathContent
        .split(/\r?\n/)
        .map((line) => wrapBareLatexLine(line))
        .join("\n");

    // Preprocess content to ensure proper paragraph breaks and LaTeX rendering
    // Convert single line breaks to double line breaks for better readability
    const processedContent = mathWrappedContent
        // First, convert literal \n sequences to actual newlines (fix for AI responses)
        .replace(/\\n/g, '\n')
        // Preserve existing double line breaks with a unique marker
        .replace(/\n\n/g, '\n\n###PRESERVE_BREAK###\n\n')
        // Convert patterns that should be new paragraphs
        .replace(/([。！？；])\n(?!\n)/g, '$1\n\n')  // Chinese punctuation followed by single newline
        .replace(/([.!?;])\s*\n(?!\n)/g, '$1\n\n')   // English punctuation followed by single newline
        .replace(/(\d+\))\s*\n(?!\n)/g, '$1\n\n')    // Numbered items like (1), (2)
        .replace(/([\u2460-\u2473])\s*\n(?!\n)/g, '$1\n\n')  // Circled numbers ①②③
        // Fix: Remove indentation for lines starting with circled numbers or (n) to prevent code block rendering
        .replace(/\n\s+([\u2460-\u2473])/g, '\n$1')
        .replace(/\n\s+(\d+\))/g, '\n$1')
        // Fix LaTeX formulas: Ensure proper spacing around $ delimiters
        // This handles cases where $ might be directly adjacent to text
        .replace(/([^\s$])(\$[^$]+\$)([^\s$])/g, '$1 $2 $3')
        // Restore preserved double line breaks (use flexible whitespace matching)
        .replace(/\s*###PRESERVE_BREAK###\s*/g, '\n\n');

    return (
        <div className={wrapperClassName}>
            <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    // 自定义样式
                    h1: ({ ...props }) => <h1 className="text-2xl font-bold mt-6 mb-4" {...props} />,
                    h2: ({ ...props }) => <h2 className="text-xl font-bold mt-5 mb-3" {...props} />,
                    h3: ({ ...props }) => <h3 className="text-lg font-bold mt-4 mb-2" {...props} />,
                    p: ({ ...props }) => <p className={paragraphClassName} {...props} />,
                    ul: ({ ...props }) => <ul className={unorderedListClassName} {...props} />,
                    ol: ({ ...props }) => <ol className={orderedListClassName} {...props} />,
                    li: ({ ...props }) => <li className={listItemClassName} {...props} />,
                    blockquote: ({ ...props }) => (
                        <blockquote className="border-l-4 border-primary pl-4 italic my-4 text-muted-foreground" {...props} />
                    ),
                    code: ({ inline, children, ...props }: ComponentPropsWithoutRef<"code"> & { inline?: boolean }) => {
                        if (inline) {
                            return <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground" {...props}>{children}</code>;
                        }
                        return (
                            <code className="block bg-muted p-4 rounded-lg overflow-x-auto my-3 font-mono text-sm" {...props}>
                                {children}
                            </code>
                        );
                    },
                    table: ({ ...props }) => (
                        <div className="overflow-x-auto my-4">
                            <table className="min-w-full border-collapse border border-border" {...props} />
                        </div>
                    ),
                    th: ({ ...props }) => (
                        <th className="border border-border px-4 py-2 bg-muted font-semibold text-left" {...props} />
                    ),
                    td: ({ ...props }) => (
                        <td className="border border-border px-4 py-2" {...props} />
                    ),
                    strong: ({ ...props }) => <strong className="font-bold text-foreground" {...props} />,
                    em: ({ ...props }) => <em className="italic" {...props} />,
                }}
            >
                {processedContent}
            </ReactMarkdown>
        </div>
    );
}
