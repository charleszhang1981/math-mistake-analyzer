import { z } from "zod";

const CHECKER_ENGINE = "rule_v2" as const;
const LEGACY_CHECKER_ENGINE = "rule_v1" as const;

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

const CheckerEngineSchema = z.enum([LEGACY_CHECKER_ENGINE, CHECKER_ENGINE]);

export const CheckerJsonSchema = z.object({
    engine: CheckerEngineSchema,
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

const DiagnosisEngineSchema = z.enum([LEGACY_CHECKER_ENGINE, CHECKER_ENGINE]);

export const DiagnosisJsonSchema = z.object({
    version: DiagnosisEngineSchema,
    candidates: z.array(DiagnosisCandidateSchema),
    finalCause: z.string().nullable().optional(),
});

export type CheckerJson = z.infer<typeof CheckerJsonSchema>;
export type DiagnosisJson = z.infer<typeof DiagnosisJsonSchema>;

type CheckerInput = {
    questionText?: string | null;
    answerText?: string | null; // standard answer
    studentAnswerText?: string | null;
    structuredJson?: unknown;
    verificationMode?: "student" | "answer";
};

type DiagnosisInput = {
    questionText?: string | null;
    answerText?: string | null;
    studentAnswerText?: string | null;
    analysis?: string | null;
    structuredJson?: unknown;
};

type ParsedAnswer = {
    raw: string | null;
    numeric: number | null;
    fraction: Fraction | null;
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
            try {
                return new Fraction(BigInt(fractionMatch[1]), BigInt(fractionMatch[2]));
            } catch {
                return null;
            }
        }

        const decimalMatch = text.match(/^([+-]?\d+)\.(\d+)$/);
        if (decimalMatch) {
            const intPart = decimalMatch[1];
            const decPart = decimalMatch[2];
            const sign = intPart.startsWith("-") ? -1n : 1n;
            const absInt = BigInt(intPart.replace("+", "").replace("-", ""));
            const denominator = BigInt(`1${"0".repeat(decPart.length)}`);
            const decimal = BigInt(decPart);
            const numerator = sign * (absInt * denominator + decimal);
            return new Fraction(numerator, denominator);
        }

        if (/^[+-]?\d+$/.test(text)) {
            try {
                return new Fraction(BigInt(text), BIGINT_ONE);
            } catch {
                return null;
            }
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

    reciprocal(): Fraction {
        return new Fraction(this.d, this.n);
    }

    pow(exp: number): Fraction | null {
        if (!Number.isInteger(exp) || Math.abs(exp) > 12) return null;
        if (exp === 0) return new Fraction(BIGINT_ONE, BIGINT_ONE);

        const positiveExp = Math.abs(exp);
        let result = new Fraction(BIGINT_ONE, BIGINT_ONE);
        for (let i = 0; i < positiveExp; i++) {
            result = result.mul(this);
        }
        return exp > 0 ? result : result.reciprocal();
    }

    equals(other: Fraction): boolean {
        return this.n === other.n && this.d === other.d;
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
    const asFraction = Fraction.fromString(raw);
    if (asFraction) return asFraction.toNumber();

    const asNumber = Number(raw);
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

function approxEqual(a: number, b: number): boolean {
    return Math.abs(a - b) < 1e-8;
}

function extractStudentAnswerFromStructuredJson(structuredJson: unknown): string | null {
    if (!structuredJson || typeof structuredJson !== "object") {
        return null;
    }

    const maybeMistake = (structuredJson as Record<string, unknown>).mistake;
    if (!maybeMistake || typeof maybeMistake !== "object") {
        return null;
    }

    const studentAnswer = (maybeMistake as Record<string, unknown>).studentAnswer;
    if (typeof studentAnswer === "string" && studentAnswer.trim().length > 0) {
        return studentAnswer.trim();
    }

    return null;
}

function parseAnswerCandidate(text: string | null | undefined): ParsedAnswer {
    const source = text?.trim() || "";
    if (!source) {
        return { raw: null, numeric: null, fraction: null };
    }

    const patterns = [
        /(?:x|y)\s*=\s*([+-]?\d+(?:\.\d+)?(?:\s*\/\s*[+-]?\d+)?)/i,
        /=\s*([+-]?\d+(?:\.\d+)?(?:\s*\/\s*[+-]?\d+)?)/,
        /([+-]?\d+(?:\.\d+)?(?:\s*\/\s*[+-]?\d+)?)/,
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (!match) continue;
        const raw = match[1].replace(/\s+/g, "");
        const fraction = Fraction.fromString(raw);
        const numeric = fraction ? fraction.toNumber() : parseNumberOrFraction(raw);
        return { raw, numeric, fraction };
    }

    return { raw: null, numeric: null, fraction: null };
}

function normalizeMathExpression(raw: string): string {
    let expr = raw
        .replace(/\$/g, "")
        .replace(/\\left|\\right/g, "")
        .replace(/\\times|\\cdot|×/g, "*")
        .replace(/\\div|÷/g, "/")
        .replace(/[［\[]/g, "(")
        .replace(/[］\]]/g, ")")
        .replace(/[{}]/g, (char) => (char === "{" ? "(" : ")"))
        .replace(/[−–—]/g, "-")
        .replace(/\s+/g, "");

    // Expand simple latex fractions repeatedly.
    for (let i = 0; i < 8; i++) {
        const next = expr.replace(/\\frac\(([^()]+)\)\(([^()]+)\)/g, "(($1)/($2))");
        if (next === expr) break;
        expr = next;
    }
    for (let i = 0; i < 8; i++) {
        const next = expr.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "(($1)/($2))");
        if (next === expr) break;
        expr = next;
    }

    // Insert implicit multiplication: 2(3+4) and )(.
    expr = expr
        .replace(/(\d|\))\(/g, "$1*(")
        .replace(/\)(\d)/g, ")*$1");

    return expr;
}

function extractFractionExpression(questionText: string): string | null {
    const normalized = questionText.trim();
    if (!normalized) return null;

    const direct = normalized.match(/(.+?)\s*=\s*[?？]/);
    if (direct?.[1]) {
        return direct[1].trim();
    }

    const lineCandidates = normalized
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /\d/.test(line) && /[+\-*/^÷×\\]/.test(line));

    if (lineCandidates.length > 0) {
        return lineCandidates.sort((a, b) => b.length - a.length)[0];
    }

    const chunkCandidates = normalized
        .match(/[0-9+\-*/^÷×\\\[\](){}.\s]{5,}/g)
        ?.map((chunk) => chunk.trim())
        .filter((chunk) => /\d/.test(chunk) && /[+\-*/^÷×\\]/.test(chunk));

    if (!chunkCandidates || chunkCandidates.length === 0) return null;
    return chunkCandidates.sort((a, b) => b.length - a.length)[0];
}

function tokenizeExpression(raw: string): string[] | null {
    const compact = normalizeMathExpression(raw);
    if (!compact) return null;

    // Any remaining letters make this expression unsafe for deterministic checking.
    if (/[A-Za-z\u4e00-\u9fff]/.test(compact)) {
        return null;
    }

    const tokenRegex = /(\d+\/\d+|\d+\.\d+|\d+|[+\-*/^()])/g;
    const tokens = compact.match(tokenRegex);
    if (!tokens || tokens.join("") !== compact) return null;
    return tokens;
}

function toRpn(tokens: string[]): string[] | null {
    const output: string[] = [];
    const operators: string[] = [];
    const precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
    const rightAssociative = new Set(["^"]);
    let prevToken: string | null = null;

    for (const token of tokens) {
        if (/^\d+\/\d+$|^\d+\.\d+$|^\d+$/.test(token)) {
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

        if (!["+", "-", "*", "/", "^"].includes(token)) {
            return null;
        }

        if ((token === "+" || token === "-") && (prevToken === null || ["(", "+", "-", "*", "/", "^"].includes(prevToken))) {
            // Unary operator: "+a" => "a", "-a" => "0 a -"
            if (token === "+") {
                prevToken = token;
                continue;
            }
            output.push("0");
        }

        while (
            operators.length > 0 &&
            operators[operators.length - 1] !== "(" &&
            (
                precedence[operators[operators.length - 1]] > precedence[token] ||
                (
                    precedence[operators[operators.length - 1]] === precedence[token] &&
                    !rightAssociative.has(token)
                )
            )
        ) {
            output.push(operators.pop()!);
        }

        operators.push(token);
        prevToken = token;
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
        if (/^\d+\/\d+$|^\d+\.\d+$|^\d+$/.test(token)) {
            const parsed = Fraction.fromString(token);
            if (!parsed) return null;
            stack.push(parsed);
            continue;
        }

        const right = stack.pop();
        const left = stack.pop();
        if (!left || !right) return null;

        try {
            if (token === "+") {
                stack.push(left.add(right));
            } else if (token === "-") {
                stack.push(left.sub(right));
            } else if (token === "*") {
                stack.push(left.mul(right));
            } else if (token === "/") {
                stack.push(left.div(right));
            } else if (token === "^") {
                if (right.d !== BIGINT_ONE) return null;
                const exp = Number(right.n);
                const powered = left.pow(exp);
                if (!powered) return null;
                stack.push(powered);
            } else {
                return null;
            }
        } catch {
            return null;
        }
    }

    return stack.length === 1 ? stack[0] : null;
}

function buildTypedUncheckableChecker(
    type: z.infer<typeof CheckerTypeSchema>,
    reason: string,
    standardAnswer: string | null,
    studentAnswer: string | null,
    intermediates: Array<{ name: string; value: string }> = [],
): CheckerJson {
    return {
        engine: CHECKER_ENGINE,
        type,
        checkable: false,
        standard_answer: standardAnswer,
        student_answer: studentAnswer,
        is_correct: null,
        diff: reason,
        key_intermediates: intermediates,
    };
}

function buildUnknownChecker(reason: string): CheckerJson {
    return buildTypedUncheckableChecker("unknown", reason, null, null);
}

function buildLinearEquationChecker(
    questionText: string,
    standardAnswerText: string,
    studentAnswerText: string | null,
    verificationMode: "student" | "answer",
): CheckerJson | null {
    const compact = questionText.replace(/\s+/g, "");
    const match = compact.match(/([+-]?\d*\.?\d*)x([+-]\d*\.?\d+)?=([+-]?\d*\.?\d+)/i);
    if (!match) return null;

    const a = normalizeEquationCoefficient(match[1], 1);
    const b = normalizeEquationCoefficient(match[2], 0);
    const c = Number(match[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || Math.abs(a) < 1e-10) {
        return buildTypedUncheckableChecker("linear_equation", "Equation is not numerically stable for checking.", null, null);
    }

    const standard = (c - b) / a;
    const parsedStandard = parseAnswerCandidate(standardAnswerText);
    const parsedStudent = parseAnswerCandidate(studentAnswerText);
    const standardLabel = formatNumber(standard);

    if (parsedStandard.numeric !== null && !approxEqual(parsedStandard.numeric, standard)) {
        return buildTypedUncheckableChecker(
            "linear_equation",
            `Provided standard answer (${parsedStandard.raw}) conflicts with equation result (${standardLabel}).`,
            standardLabel,
            parsedStudent.raw,
            [
                { name: "a", value: formatNumber(a) },
                { name: "b", value: formatNumber(b) },
                { name: "c", value: formatNumber(c) },
            ],
        );
    }

    const target = verificationMode === "answer" ? parsedStandard : parsedStudent;
    const isCorrect = target.numeric !== null ? approxEqual(target.numeric, standard) : null;

    return {
        engine: CHECKER_ENGINE,
        type: "linear_equation",
        checkable: true,
        standard_answer: standardLabel,
        student_answer: parsedStudent.raw,
        is_correct: isCorrect,
        diff: isCorrect === true
            ? null
            : target.raw
                ? verificationMode === "answer"
                    ? `Expected x = ${standardLabel}, but provided answer is x = ${target.raw}.`
                    : `Expected x = ${standardLabel}, student got x = ${target.raw}.`
                : verificationMode === "answer"
                    ? "Could not parse provided answer for x."
                    : "Student answer unavailable or unparseable for x.",
        key_intermediates: [
            { name: "a", value: formatNumber(a) },
            { name: "b", value: formatNumber(b) },
            { name: "c", value: formatNumber(c) },
        ],
    };
}

function buildRatioChecker(
    questionText: string,
    standardAnswerText: string,
    studentAnswerText: string | null,
    verificationMode: "student" | "answer",
): CheckerJson | null {
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
        if (!Number.isFinite(solved)) {
            return buildTypedUncheckableChecker("ratio", "Ratio equation produced non-finite result.", null, null);
        }
        standard = solved;
        intermediates = pattern.intermediates(match);
        break;
    }

    if (standard === null) return null;

    const parsedStandard = parseAnswerCandidate(standardAnswerText);
    const parsedStudent = parseAnswerCandidate(studentAnswerText);
    const standardLabel = formatNumber(standard);

    if (parsedStandard.numeric !== null && !approxEqual(parsedStandard.numeric, standard)) {
        return buildTypedUncheckableChecker(
            "ratio",
            `Provided standard answer (${parsedStandard.raw}) conflicts with ratio result (${standardLabel}).`,
            standardLabel,
            parsedStudent.raw,
            intermediates,
        );
    }

    const target = verificationMode === "answer" ? parsedStandard : parsedStudent;
    const isCorrect = target.numeric !== null ? approxEqual(target.numeric, standard) : null;

    return {
        engine: CHECKER_ENGINE,
        type: "ratio",
        checkable: true,
        standard_answer: standardLabel,
        student_answer: parsedStudent.raw,
        is_correct: isCorrect,
        diff: isCorrect === true
            ? null
            : target.raw
                ? verificationMode === "answer"
                    ? `Expected x = ${standardLabel}, but provided answer is x = ${target.raw}.`
                    : `Expected x = ${standardLabel}, student got x = ${target.raw}.`
                : verificationMode === "answer"
                    ? "Could not parse provided ratio answer."
                    : "Student ratio answer unavailable or unparseable.",
        key_intermediates: intermediates,
    };
}

function buildFractionChecker(
    questionText: string,
    standardAnswerText: string,
    studentAnswerText: string | null,
    verificationMode: "student" | "answer",
): CheckerJson | null {
    const expression = extractFractionExpression(questionText);
    if (!expression) return null;

    const tokens = tokenizeExpression(expression);
    if (!tokens) {
        return buildTypedUncheckableChecker(
            "fraction_arithmetic",
            "Expression contains unsupported symbols; downgraded to uncheckable.",
            null,
            parseAnswerCandidate(studentAnswerText).raw,
            [{ name: "expression", value: expression }],
        );
    }

    const rpn = toRpn(tokens);
    if (!rpn) {
        return buildTypedUncheckableChecker(
            "fraction_arithmetic",
            "Expression parser could not build a stable execution order.",
            null,
            parseAnswerCandidate(studentAnswerText).raw,
            [{ name: "expression", value: normalizeMathExpression(expression) }],
        );
    }

    const evaluated = evaluateRpn(rpn);
    if (!evaluated) {
        return buildTypedUncheckableChecker(
            "fraction_arithmetic",
            "Expression evaluator failed; downgraded to uncheckable.",
            null,
            parseAnswerCandidate(studentAnswerText).raw,
            [{ name: "expression", value: normalizeMathExpression(expression) }],
        );
    }

    const parsedStandard = parseAnswerCandidate(standardAnswerText);
    const parsedStudent = parseAnswerCandidate(studentAnswerText);
    const standardFromExpression = evaluated.toAnswerString();

    if (parsedStandard.fraction && !parsedStandard.fraction.equals(evaluated)) {
        return buildTypedUncheckableChecker(
            "fraction_arithmetic",
            `Provided standard answer (${parsedStandard.raw}) conflicts with computed expression result (${standardFromExpression}).`,
            standardFromExpression,
            parsedStudent.raw,
            [{ name: "expression", value: normalizeMathExpression(expression) }],
        );
    }

    if (parsedStandard.numeric !== null && !approxEqual(parsedStandard.numeric, evaluated.toNumber())) {
        return buildTypedUncheckableChecker(
            "fraction_arithmetic",
            `Provided standard answer (${parsedStandard.raw}) conflicts with computed expression result (${standardFromExpression}).`,
            standardFromExpression,
            parsedStudent.raw,
            [{ name: "expression", value: normalizeMathExpression(expression) }],
        );
    }

    const target = verificationMode === "answer" ? parsedStandard : parsedStudent;
    let isCorrect: boolean | null = null;
    if (target.fraction) {
        isCorrect = target.fraction.equals(evaluated);
    } else if (target.numeric !== null) {
        isCorrect = approxEqual(target.numeric, evaluated.toNumber());
    }

    return {
        engine: CHECKER_ENGINE,
        type: "fraction_arithmetic",
        checkable: true,
        standard_answer: standardFromExpression,
        student_answer: parsedStudent.raw,
        is_correct: isCorrect,
        diff: isCorrect === true
            ? null
            : target.raw
                ? verificationMode === "answer"
                    ? `Expected ${standardFromExpression}, but provided answer is ${target.raw}.`
                    : `Expected ${standardFromExpression}, student got ${target.raw}.`
                : verificationMode === "answer"
                    ? "Could not parse provided answer as number/fraction."
                    : "Student answer unavailable or unparseable as number/fraction.",
        key_intermediates: [
            { name: "expression", value: normalizeMathExpression(expression) },
        ],
    };
}

function extractStepEvidence(context: DiagnosisInput): string | null {
    const fromStructured = (() => {
        const structured = context.structuredJson;
        if (!structured || typeof structured !== "object") return null;
        const maybeMistake = (structured as Record<string, unknown>).mistake;
        if (!maybeMistake || typeof maybeMistake !== "object") return null;
        const steps = (maybeMistake as Record<string, unknown>).studentSteps;
        if (!Array.isArray(steps)) return null;
        const firstText = steps.find((entry) => typeof entry === "string" && entry.trim().length > 0);
        return typeof firstText === "string" ? firstText.trim() : null;
    })();

    if (fromStructured) return fromStructured.slice(0, 160);

    const fromAnalysis = context.analysis
        ?.split(/\r?\n|[。.!?]/)
        .map((segment) => segment.trim())
        .find((segment) => segment.length > 0);

    return fromAnalysis ? fromAnalysis.slice(0, 160) : null;
}

function buildDiagnosisCandidate(
    checker: CheckerJson,
    context: DiagnosisInput,
): z.infer<typeof DiagnosisCandidateSchema> {
    const standard = checker.standard_answer ?? "N/A";
    const student = checker.student_answer ?? "N/A";
    const stepEvidence = extractStepEvidence(context);
    const evidenceBase = checker.diff
        ? checker.diff
        : `standard=${standard}; student=${student}`;
    const evidence = stepEvidence
        ? `${evidenceBase}; step=${stepEvidence}`
        : evidenceBase;

    if (!checker.checkable) {
        return {
            cause: "Not safely checkable",
            trigger: "manual_review",
            evidence: context.questionText?.slice(0, 120) || "No parseable deterministic pattern found.",
            questions_to_ask: [
                "Can you rewrite your key calculation steps clearly?",
            ],
        };
    }

    if (checker.is_correct === null) {
        return {
            cause: "Student answer missing",
            trigger: "missing_student_answer",
            evidence,
            questions_to_ask: [
                "What is your final answer before we compare reasoning?",
            ],
        };
    }

    if (checker.is_correct === true) {
        return {
            cause: "Result appears correct; verify process-level mistakes",
            trigger: "process_mistake",
            evidence,
            questions_to_ask: [
                "Which step felt uncertain when you solved it?",
            ],
        };
    }

    if (checker.type === "linear_equation") {
        const standardNumber = checker.standard_answer ? Number(checker.standard_answer) : null;
        const studentNumber = checker.student_answer ? parseNumberOrFraction(checker.student_answer) : null;
        if (
            standardNumber !== null &&
            studentNumber !== null &&
            approxEqual(standardNumber + studentNumber, 0)
        ) {
            return {
                cause: "Sign error when moving terms",
                trigger: "sign_error",
                evidence,
                questions_to_ask: [
                    "Did you flip the sign when moving a term across '='?",
                ],
            };
        }

        return {
            cause: "Equation solving arithmetic error",
            trigger: "equation_calc",
            evidence,
            questions_to_ask: [
                "Can you re-check each transformation from one line to the next?",
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
                cause: "Reciprocal inversion mistake",
                trigger: "fraction_reciprocal",
                evidence,
                questions_to_ask: [
                    "Why did the numerator and denominator swap at this step?",
                ],
            };
        }

        return {
            cause: "Fraction operation or common-denominator error",
            trigger: "fraction_calc",
            evidence,
            questions_to_ask: [
                "After finding a common denominator, what numerator did you get?",
            ],
        };
    }

    if (checker.type === "ratio") {
        return {
            cause: "Proportion solving error",
            trigger: "ratio_calc",
            evidence,
            questions_to_ask: [
                "What equation did you write after cross multiplication?",
            ],
        };
    }

    return {
        cause: "General arithmetic/process error",
        trigger: "general_calc",
        evidence,
        questions_to_ask: [
            "Can you verify each intermediate step again?",
        ],
    };
}

export function buildCheckerJson(input: CheckerInput): CheckerJson {
    const questionText = input.questionText?.trim() || "";
    const answerText = input.answerText?.trim() || "";
    const studentAnswerText = (input.studentAnswerText?.trim() || extractStudentAnswerFromStructuredJson(input.structuredJson) || null);
    const verificationMode = input.verificationMode || "student";

    if (!questionText || !answerText) {
        return buildUnknownChecker("Insufficient question/answer text for checking.");
    }

    return (
        buildLinearEquationChecker(questionText, answerText, studentAnswerText, verificationMode) ||
        buildRatioChecker(questionText, answerText, studentAnswerText, verificationMode) ||
        buildFractionChecker(questionText, answerText, studentAnswerText, verificationMode) ||
        buildUnknownChecker("Unsupported pattern for current checker.")
    );
}

export function buildDiagnosisJson(
    input: DiagnosisInput,
    checker: CheckerJson,
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
