import { normalizeCheckerJson } from "@/lib/math-checker";

export type RootCauseChatRole = "user" | "assistant";

export type RootCauseChatTurn = {
    role: RootCauseChatRole;
    content: string;
};

export type RootCauseChatInput = {
    questionText?: string | null;
    answerText?: string | null;
    analysis?: string | null;
    checkerJson?: unknown;
    turns: RootCauseChatTurn[];
};

export type RootCauseChatOutput = {
    assistantQuestion: string;
    summaryDraft: string;
};

function trimTurnContent(turns: RootCauseChatTurn[]): RootCauseChatTurn[] {
    return turns
        .map((turn) => ({
            role: turn.role,
            content: turn.content.trim(),
        }))
        .filter((turn) => turn.content.length > 0);
}

function inferPromptByChecker(checkerJson: unknown): string {
    const checker = normalizeCheckerJson(checkerJson);
    if (!checker) return "Let's locate your first uncertain step.";

    if (checker.type === "linear_equation") {
        return "Focus on sign changes while moving terms across '='.";
    }
    if (checker.type === "fraction_arithmetic") {
        return "Focus on denominator alignment and exponent handling.";
    }
    if (checker.type === "ratio") {
        return "Focus on the equation after cross multiplication.";
    }
    return "Let's locate your first uncertain step.";
}

function buildSummaryDraft(turns: RootCauseChatTurn[]): string {
    const userTurns = turns.filter((turn) => turn.role === "user");
    if (userTurns.length === 0) return "";
    return userTurns
        .slice(-3)
        .map((turn) => turn.content)
        .join(" ");
}

export function generateRootCauseChatReply(input: RootCauseChatInput): RootCauseChatOutput {
    const turns = trimTurnContent(input.turns || []);
    const userTurns = turns.filter((turn) => turn.role === "user");
    const focusHint = inferPromptByChecker(input.checkerJson);

    let assistantQuestion = "Can you describe how you solved this question in 2-3 steps?";
    if (userTurns.length === 1) {
        assistantQuestion = `Which exact step first became uncertain? ${focusHint}`;
    } else if (userTurns.length === 2) {
        assistantQuestion = "What misconception caused that step (formula, sign, operation order, or interpretation)?";
    } else if (userTurns.length >= 3) {
        assistantQuestion = "Please summarize your confirmed root cause in one sentence.";
    }

    return {
        assistantQuestion,
        summaryDraft: buildSummaryDraft(turns),
    };
}
