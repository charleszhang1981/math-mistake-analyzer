import { MarkdownRenderer } from "@/components/markdown-renderer";

interface CompactNumberedStepsProps {
    steps: string[];
    className?: string;
    itemClassName?: string;
    markerClassName?: string;
    contentClassName?: string;
    normalizeStep?: (step: string) => string;
}

function collapseDisplayMath(step: string): string {
    return step
        .replace(/\$\$([\s\S]*?)\$\$/g, (_match, body: string) => {
            const compactBody = body.replace(/\r?\n+/g, " ").replace(/\s{2,}/g, " ").trim();
            return compactBody ? `$${compactBody}$` : "";
        })
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body: string) => {
            const compactBody = body.replace(/\r?\n+/g, " ").replace(/\s{2,}/g, " ").trim();
            return compactBody ? `$${compactBody}$` : "";
        });
}

export function CompactNumberedSteps({
    steps,
    className = "",
    itemClassName = "",
    markerClassName = "",
    contentClassName = "",
    normalizeStep,
}: CompactNumberedStepsProps) {
    const displaySteps = steps
        .map((step) => (normalizeStep ? normalizeStep(step) : step))
        .map((step) => collapseDisplayMath(step))
        .map((step) => step.trim())
        .filter((step) => step.length > 0);

    if (displaySteps.length === 0) {
        return null;
    }

    return (
        <>
            <div className={`compact-numbered-steps space-y-1 ${className}`.trim()}>
                {displaySteps.map((step, index) => (
                    <div
                        key={`compact-step-${index}`}
                        className={`flex items-start gap-2 text-sm leading-snug ${itemClassName}`.trim()}
                    >
                        <span className={`w-6 shrink-0 font-medium leading-snug ${markerClassName}`.trim()}>
                            {index + 1}.
                        </span>
                        <div className={`min-w-0 flex-1 ${contentClassName}`.trim()}>
                            <MarkdownRenderer content={step} compact inlineParagraphs />
                        </div>
                    </div>
                ))}
            </div>
            <style jsx global>{`
                .compact-numbered-steps .markdown-content {
                    overflow: visible !important;
                }

                .compact-numbered-steps .katex-display {
                    display: inline;
                    margin: 0;
                    text-align: inherit;
                }

                .compact-numbered-steps .katex-display > .katex,
                .compact-numbered-steps .katex-display > .katex > .katex-html {
                    display: inline;
                    text-align: inherit;
                }
            `}</style>
        </>
    );
}
