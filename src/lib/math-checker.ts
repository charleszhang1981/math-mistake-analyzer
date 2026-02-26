import { z } from "zod";

// Milestone 4 execution decision:
// Phase A (now): in-process Node rule checker for fast MVP delivery.
// Phase B (later): replace/augment with Math-Verify service for broader coverage.

const CHECKER_ENGINE = "rule_v1" as const;

const CheckerIntermediateSchema = z.object({
    name: z.string().min(1),
    value: z.string().min(1),
});

const CheckerTypeSchema = z.enum([
    "fraction_arithmetic",
    "linear_equation",
    "ratio",
    "unknown",
]);

export const CheckerJsonSchema = z.object({
    engine: z.literal(CHECKER_ENGINE),
    type: CheckerTypeSchema,
    checkable: z.boolean(),
    standard_answer: z.string().nullable(),
    student_answer: z.string().nullable(),
    is_correct: z.boolean().nullable(),
    diff: z.string().nullable(),
    key_intermediates: z.array(CheckerIntermediateSchema),
});

const DiagnosisCandidateSchema = z.object({
    cause: z.string().min(1),
    trigger: z.string().min(1),
    evidence: z.string().min(1),
    questions_to_ask: z.array(z.string()),
});

export const DiagnosisJsonSchema = z.object({
    version: z.literal(CHECKER_ENGINE),
    candidates: z.array(DiagnosisCandidateSchema),
    finalCause: z.string().nullable().optional(),
});

export type CheckerJson = z.infer<typeof CheckerJsonSchema>;
export type DiagnosisJson = z.infer<typeof DiagnosisJsonSchema>;

type CheckerInput = {
    questionText?: string | null;
    answerText?: string | null;
};

type DiagnosisInput = {
    questionText?: string | null;
    answerText?: string | null;
    analysis?: string | null;
};

const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);
const BIGINT_NEG_ONE = BigInt(-1);

function gcd(a: bigint, b: bigint): bigint {
    let x = a < BIGINT_ZERO ? -a : a;
    let y = b < BIGINT_ZERO ? -b : b;
    while (y !== BIGINT_ZERO) {
        const temp = x % y;
        x = y;
        y = temp;
    }
    return x === BIGINT_ZERO ? BIGINT_ONE : x;
}

class Fraction {
    readonly n: bigint;
    readonly d: bigint;

    constructor(numerator: bigint, denominator: bigint) {
        if (denominator === BIGINT_ZERO) {
            throw new Error("Division by zero");
        }
        const sign = denominator < BIGINT_ZERO ? BIGINT_NEG_ONE : BIGINT_ONE;
        const g = gcd(numerator, denominator);
        this.n = (numerator / g) * sign;
        this.d = (denominator / g) * sign;
    }

    static fromString(raw: string): Fraction | null {
        const text = raw.trim();
        if (!text) return null;

        const fractionMatch = text.match(/^([+-]?\d+)\s*\/\s*([+-]?\d+)$/);
        if (fractionMatch) {
            return new Fraction(BigInt(fractionMatch[1]), BigInt(fractionMatch[2]));
        }

        if (/^[+-]?\d+$/.test(text)) {
            return new Fraction(BigInt(text), BIGINT_ONE);
        }

        return null;
    }

    add(other: Fraction): Fraction {
        return new Fraction(this.n * other.d + other.n * this.d, this.d * other.d);
    }

    sub(other: Fraction): Fraction {
        return new Fraction(this.n * other.d - other.n * this.d, this.d * other.d);
    }

    mul(other: Fraction): Fraction {
        return new Fraction(this.n * other.n, this.d * other.d);
    }

    div(other: Fraction): Fraction {
        return new Fraction(this.n * other.d, this.d * other.n);
    }

    equals(other: Fraction): boolean {
        return this.n === other.n && this.d === other.d;
    }

    reciprocal(): Fraction {
        return new Fraction(this.d, this.n);
    }

    toNumber(): number {
        return Number(this.n) / Number(this.d);
    }

    toAnswerString(): string {
        if (this.d === BIGINT_ONE) return this.n.toString();
        return `${this.n}/${this.d}`;
    }
}

function parseNumberOrFraction(raw: string): number | null {
    const text = raw.trim();
    if (!text) return null;

    const asFraction = Fraction.fromString(text);
    if (asFraction) return asFraction.toNumber();

    const asNumber = Number(text);
    return Number.isFinite(asNumber) ? asNumber : null;
}

function normalizeEquationCoefficient(text: string | undefined, fallback: number): number {
    if (text === undefined || text === "") return fallback;
    if (text === "+") return 1;
    if (text === "-") return -1;
    const value = Number(text);
    return Number.isFinite(value) ? value : fallback;
}

function formatNumber(value: number): string {
    if (!Number.isFinite(value)) return `${value}`;
    if (Math.abs(value - Math.round(value)) < 1e-10) return `${Math.round(value)}`;
    return `${Number(value.toFixed(8))}`;
}

function parseStudentAnswerNumber(answerText: string): { raw: string | null; value: number | null } {
    const directMatch = answerText.match(/x\s*=\s*([+-]?\d+(?:\.\d+)?(?:\/\d+)?)/i);
    if (directMatch) {
        return {
            raw: directMatch[1],
            value: parseNumberOrFraction(directMatch[1]),
        };
    }

    const numberLikeMatch = answerText.match(/([+-]?\d+(?:\.\d+)?(?:\/\d+)?)/);
    if (numberLikeMatch) {
        return {
            raw: numberLikeMatch[1],
            value: parseNumberOrFraction(numberLikeMatch[1]),
        };
    }

    return { raw: null, value: null };
}

function tokenizeExpression(raw: string): string[] | null {
    const compact = raw
        .replace(/[×xX]/g, "*")
        .replace(/[÷]/g, "/")
        .replace(/[，。；：！？=?？]/g, " ")
        .replace(/\s+/g, "");

    if (!compact) return null;
    if (!/[+\-*/]/.test(compact)) return null;
    if (!/^\d|[+\-*/()]/.test(compact)) return null;

    const tokenRegex = /(\d+\/\d+|\d+|[+\-*/()])/g;
    const tokens = compact.match(tokenRegex);
    if (!tokens || tokens.join("") !== compact) return null;
    return tokens;
}

function toRpn(tokens: string[]): string[] | null {
    const output: string[] = [];
    const operators: string[] = [];
    const precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
    let prevToken: string | null = null;

    for (const token of tokens) {
        if (/^\d+\/\d+$|^\d+$/.test(token)) {
            output.push(token);
            prevToken = token;
            continue;
        }

        if (token === "(") {
            operators.push(token);
            prevToken = token;
            continue;
        }

        if (token === ")") {
            while (operators.length > 0 && operators[operators.length - 1] !== "(") {
                output.push(operators.pop()!);
            }
            if (operators.length === 0) return null;
            operators.pop();
            prevToken = token;
            continue;
        }

        if (["+","-","*","/"].includes(token)) {
            if (token === "-" && (prevToken === null || ["(", "+", "-", "*", "/"].includes(prevToken))) {
                output.push("0");
            }

            while (
                operators.length > 0 &&
                operators[operators.length - 1] !== "(" &&
                precedence[operators[operators.length - 1]] >= precedence[token]
            ) {
                output.push(operators.pop()!);
            }
            operators.push(token);
            prevToken = token;
            continue;
        }

        return null;
    }

    while (operators.length > 0) {
        const op = operators.pop()!;
        if (op === "(") return null;
        output.push(op);
    }

    return output;
}

function evaluateRpn(tokens: string[]): Fraction | null {
    const stack: Fraction[] = [];
    for (const token of tokens) {
        if (/^\d+\/\d+$|^\d+$/.test(token)) {
            const parsed = Fraction.fromString(token);
            if (!parsed) return null;
            stack.push(parsed);
            continue;
        }

        const right = stack.pop();
        const left = stack.pop();
        if (!left || !right) return null;

        try {
            if (token === "+") stack.push(left.add(right));
            else if (token === "-") stack.push(left.sub(right));
            else if (token === "*") stack.push(left.mul(right));
            else if (token === "/") stack.push(left.div(right));
            else return null;
        } catch {
            return null;
        }
    }

    return stack.length === 1 ? stack[0] : null;
}

function extractFractionExpression(questionText: string): string | null {
    const directExpression = questionText.match(/([0-9+\-*/()\s\/]+)\s*=\s*[?？]/);
    if (directExpression?.[1]) {
        return directExpression[1].trim();
    }

    const chunks = questionText.match(/[0-9+\-*/()\s\/]{5,}/g);
    if (!chunks) return null;

    const candidate = chunks
        .map((chunk) => chunk.trim())
        .filter((chunk) => /[+\-*/]/.test(chunk))
        .sort((a, b) => b.length - a.length)[0];

    return candidate || null;
}

function buildUnknownChecker(reason: string): CheckerJson {
    return {
        engine: CHECKER_ENGINE,
        type: "unknown",
        checkable: false,
        standard_answer: null,
        student_answer: null,
        is_correct: null,
        diff: reason,
        key_intermediates: [],
    };
}

function buildLinearEquationChecker(questionText: string, answerText: string): CheckerJson | null {
    const compact = questionText.replace(/\s+/g, "");
    const match = compact.match(/([+-]?\d*\.?\d*)x([+-]\d*\.?\d+)?=([+-]?\d*\.?\d+)/i);
    if (!match) return null;

    const a = normalizeEquationCoefficient(match[1], 1);
    const b = normalizeEquationCoefficient(match[2], 0);
    const c = Number(match[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || Math.abs(a) < 1e-10) {
        return null;
    }

    const standard = (c - b) / a;
    const student = parseStudentAnswerNumber(answerText);
    const isCorrect = student.value !== null ? Math.abs(student.value - standard) < 1e-8 : null;

    return {
        engine: CHECKER_ENGINE,
        type: "linear_equation",
        checkable: true,
        standard_answer: formatNumber(standard),
        student_answer: student.raw,
        is_correct: isCorrect,
        diff: isCorrect === true
            ? null
            : student.raw
                ? `Expected x = ${formatNumber(standard)}, got x = ${student.raw}`
                : "Could not parse student answer for x.",
        key_intermediates: [
            { name: "a", value: formatNumber(a) },
            { name: "b", value: formatNumber(b) },
            { name: "c", value: formatNumber(c) },
        ],
    };
}

function buildRatioChecker(questionText: string, answerText: string): CheckerJson | null {
    const compact = questionText.replace(/\s+/g, "");
    let standard: number | null = null;
    let intermediates: Array<{ name: string; value: string }> = [];

    const patterns: Array<{
        regex: RegExp;
        solve: (groups: RegExpMatchArray) => number;
        intermediates: (groups: RegExpMatchArray) => Array<{ name: string; value: string }>;
    }> = [
        {
            regex: /([+-]?\d+(?:\.\d+)?)[:]([+-]?\d+(?:\.\d+)?)=([+-]?\d+(?:\.\d+)?)[:]x/i,
            solve: (g) => (Number(g[2]) * Number(g[3])) / Number(g[1]),
            intermediates: (g) => [
                { name: "a", value: g[1] },
                { name: "b", value: g[2] },
                { name: "c", value: g[3] },
            ],
        },
        {
            regex: /x[:]([+-]?\d+(?:\.\d+)?)=([+-]?\d+(?:\.\d+)?)[:]([+-]?\d+(?:\.\d+)?)/i,
            solve: (g) => (Number(g[2]) * Number(g[1])) / Number(g[3]),
            intermediates: (g) => [
                { name: "a", value: g[1] },
                { name: "b", value: g[2] },
                { name: "c", value: g[3] },
            ],
        },
        {
            regex: /([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)=([+-]?\d+(?:\.\d+)?)\/x/i,
            solve: (g) => (Number(g[2]) * Number(g[3])) / Number(g[1]),
            intermediates: (g) => [
                { name: "a", value: g[1] },
                { name: "b", value: g[2] },
                { name: "c", value: g[3] },
            ],
        },
        {
            regex: /x\/([+-]?\d+(?:\.\d+)?)=([+-]?\d+(?:\.\d+)?)\/([+-]?\d+(?:\.\d+)?)/i,
            solve: (g) => (Number(g[2]) * Number(g[1])) / Number(g[3]),
            intermediates: (g) => [
                { name: "a", value: g[1] },
                { name: "b", value: g[2] },
                { name: "c", value: g[3] },
            ],
        },
    ];

    for (const pattern of patterns) {
        const match = compact.match(pattern.regex);
        if (!match) continue;

        const solved = pattern.solve(match);
        if (!Number.isFinite(solved)) return null;
        standard = solved;
        intermediates = pattern.intermediates(match);
        break;
    }

    if (standard === null) return null;

    const student = parseStudentAnswerNumber(answerText);
    const isCorrect = student.value !== null ? Math.abs(student.value - standard) < 1e-8 : null;

    return {
        engine: CHECKER_ENGINE,
        type: "ratio",
        checkable: true,
        standard_answer: formatNumber(standard),
        student_answer: student.raw,
        is_correct: isCorrect,
        diff: isCorrect === true
            ? null
            : student.raw
                ? `Expected x = ${formatNumber(standard)}, got x = ${student.raw}`
                : "Could not parse student answer for x.",
        key_intermediates: intermediates,
    };
}

function buildFractionChecker(questionText: string, answerText: string): CheckerJson | null {
    const expression = extractFractionExpression(questionText);
    if (!expression) return null;

    const tokens = tokenizeExpression(expression);
    if (!tokens) return null;

    const rpn = toRpn(tokens);
    if (!rpn) return null;

    const standard = evaluateRpn(rpn);
    if (!standard) return null;

    const studentRaw = parseStudentAnswerNumber(answerText).raw;
    const studentFraction = studentRaw ? Fraction.fromString(studentRaw) : null;
    const isCorrect = studentFraction ? studentFraction.equals(standard) : null;

    return {
        engine: CHECKER_ENGINE,
        type: "fraction_arithmetic",
        checkable: true,
        standard_answer: standard.toAnswerString(),
        student_answer: studentRaw,
        is_correct: isCorrect,
        diff: isCorrect === true
            ? null
            : studentRaw
                ? `Expected ${standard.toAnswerString()}, got ${studentRaw}`
                : "Could not parse student answer as fraction or integer.",
        key_intermediates: [
            { name: "expression", value: expression.replace(/\s+/g, "") },
        ],
    };
}

function buildDiagnosisCandidate(
    checker: CheckerJson,
    context: DiagnosisInput
): z.infer<typeof DiagnosisCandidateSchema> {
    const standard = checker.standard_answer ?? "N/A";
    const student = checker.student_answer ?? "N/A";
    const evidence = checker.diff
        ? `${checker.diff}`
        : `standard=${standard}; student=${student}`;

    if (!checker.checkable) {
        return {
            cause: "题型暂不支持自动判定",
            trigger: "manual_review",
            evidence: context.questionText?.slice(0, 120) || "No parseable math pattern found.",
            questions_to_ask: [
                "你能把关键计算步骤再写一遍吗？",
            ],
        };
    }

    if (checker.is_correct === true) {
        return {
            cause: "结果正确，可能是过程性错误",
            trigger: "process_mistake",
            evidence,
            questions_to_ask: [
                "你是哪一步开始不确定的？",
            ],
        };
    }

    if (checker.type === "linear_equation") {
        const standardNumber = checker.standard_answer ? Number(checker.standard_answer) : null;
        const studentNumber = checker.student_answer ? parseNumberOrFraction(checker.student_answer) : null;
        if (
            standardNumber !== null &&
            studentNumber !== null &&
            Math.abs(standardNumber + studentNumber) < 1e-8
        ) {
            return {
                cause: "移项变号错误",
                trigger: "sign_error",
                evidence,
                questions_to_ask: [
                    "移项时符号是否同时改变了？",
                ],
            };
        }

        return {
            cause: "方程求解计算错误",
            trigger: "equation_calc",
            evidence,
            questions_to_ask: [
                "请检查等式两边同加减后的结果。",
            ],
        };
    }

    if (checker.type === "fraction_arithmetic") {
        const standardFraction = checker.standard_answer ? Fraction.fromString(checker.standard_answer) : null;
        const studentFraction = checker.student_answer ? Fraction.fromString(checker.student_answer) : null;
        if (
            standardFraction &&
            studentFraction &&
            studentFraction.equals(standardFraction.reciprocal())
        ) {
            return {
                cause: "分子分母颠倒（倒数错误）",
                trigger: "fraction_reciprocal",
                evidence,
                questions_to_ask: [
                    "这里为什么把结果写成倒数了？",
                ],
            };
        }

        return {
            cause: "分数运算或通分错误",
            trigger: "fraction_calc",
            evidence,
            questions_to_ask: [
                "通分后分子分母分别是多少？",
            ],
        };
    }

    if (checker.type === "ratio") {
        return {
            cause: "比例式求解错误",
            trigger: "ratio_calc",
            evidence,
            questions_to_ask: [
                "交叉相乘后你得到的式子是什么？",
            ],
        };
    }

    return {
        cause: "计算过程错误",
        trigger: "general_calc",
        evidence,
        questions_to_ask: [
            "请再核对一遍每一步运算。",
        ],
    };
}

export function buildCheckerJson(input: CheckerInput): CheckerJson {
    const questionText = input.questionText?.trim() || "";
    const answerText = input.answerText?.trim() || "";

    if (!questionText || !answerText) {
        return buildUnknownChecker("Insufficient question/answer text for checking.");
    }

    return (
        buildLinearEquationChecker(questionText, answerText) ||
        buildRatioChecker(questionText, answerText) ||
        buildFractionChecker(questionText, answerText) ||
        buildUnknownChecker("Unsupported pattern for current checker.")
    );
}

export function buildDiagnosisJson(
    input: DiagnosisInput,
    checker: CheckerJson
): DiagnosisJson {
    return {
        version: CHECKER_ENGINE,
        candidates: [buildDiagnosisCandidate(checker, input)],
        finalCause: null,
    };
}

export function normalizeCheckerJson(value: unknown): CheckerJson | null {
    const parsed = CheckerJsonSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export function normalizeDiagnosisJson(value: unknown): DiagnosisJson | null {
    const parsed = DiagnosisJsonSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
