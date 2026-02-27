# Analysis Redesign + Checker/Diagnosis Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the F/G/H/I analysis redesign, dual-entry root-cause dialogue, and full checker/diagnosis reliability fixes (P0+P1+P2) while preserving notebook/grade/paper controls.

**Architecture:** Keep existing `ErrorItem` JSON columns and evolve `structuredJson/checkerJson/diagnosisJson` with versioned shapes. Route all student-facing explanation through `structuredJson` and keep internal diagnosis candidates server-only. Add stateless + saved-item root-cause chat APIs.

**Tech Stack:** Next.js App Router, TypeScript, Prisma (Postgres), Vitest, existing AI provider abstraction.

---

### Task 1: Add failing tests for Structured JSON v2 contract

**Files:**
- Modify: `src/__tests__/unit/ai/structured-json.test.ts`
- Modify: `src/lib/ai/structured-json.ts`

**Step 1: Write the failing test**

```ts
it("builds v2 structured payload with F/G/H skeleton", () => {
  const built = buildStructuredQuestionJson({
    questionText: "计算 -3^2 - 1/2 + 1/3[5-(-1)^4]",
    answerText: "6",
    analysis: "步骤1...步骤2..."
  });
  expect(built).not.toBeNull();
  expect((built as any).version).toBe("v2");
  expect((built as any).knowledge.tags).toBeInstanceOf(Array);
  expect((built as any).solution.steps.length).toBeGreaterThan(0);
  expect((built as any).mistake.studentSteps).toBeInstanceOf(Array);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/ai/structured-json.test.ts`  
Expected: FAIL with missing `version/knowledge/solution/mistake` shape.

**Step 3: Write minimal implementation**

```ts
// add v2 fields while keeping old problem/student fields
const candidate = {
  version: "v2",
  problem: {...},
  student: {...},
  knowledge: { tags: [] },
  solution: { finalAnswer: answerText, steps: extractSteps(analysis) },
  mistake: { studentSteps: extractSteps(analysis), wrongStepIndex: null, whyWrong: "", fixSuggestion: "" },
  rootCause: { studentHypothesis: "", confirmedCause: "", chatSummary: "" }
};
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/ai/structured-json.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/ai/structured-json.ts src/__tests__/unit/ai/structured-json.test.ts
git commit -m "feat(structured-json): add v2 F/G/H/I skeleton with backward compatibility"
```

### Task 2: Add failing tests for checker source semantics (standard vs student)

**Files:**
- Modify: `src/__tests__/unit/ai/math-checker.test.ts`
- Modify: `src/lib/math-checker.ts`

**Step 1: Write the failing test**

```ts
it("does not parse student answer from standard answer text", () => {
  const checker = buildCheckerJson({
    questionText: "解方程 2x+3=7",
    answerText: "x=2", // standard answer only
    studentAnswerText: "x=3"
  } as any);
  expect(checker.standard_answer).toBe("2");
  expect(checker.student_answer).toBe("3");
  expect(checker.is_correct).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/ai/math-checker.test.ts`  
Expected: FAIL because checker currently reads student from `answerText`.

**Step 3: Write minimal implementation**

```ts
type CheckerInput = {
  questionText?: string | null;
  answerText?: string | null;         // standard
  studentAnswerText?: string | null;  // new explicit source
};
```

Use `studentAnswerText ?? extract from structuredJson.mistake` and never default to `answerText`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/ai/math-checker.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/math-checker.ts src/__tests__/unit/ai/math-checker.test.ts
git commit -m "fix(checker): separate standard answer from student answer source"
```

### Task 3: Add failing tests for expression normalization and safe downgrade

**Files:**
- Modify: `src/__tests__/unit/ai/math-checker.test.ts`
- Modify: `src/lib/math-checker.ts`

**Step 1: Write the failing test**

```ts
it("normalizes latex/brackets/power for fraction arithmetic", () => {
  const checker = buildCheckerJson({
    questionText: "$-3^2 - \\frac{1}{2} + \\frac{1}{3}[5-(-1)^4]$",
    answerText: "-53/6",
    studentAnswerText: "55"
  } as any);
  expect(checker.checkable).toBe(true);
  expect(checker.standard_answer).toBe("-53/6");
  expect(checker.is_correct).toBe(false);
});

it("downgrades to uncheckable when expression parse is ambiguous", () => {
  const checker = buildCheckerJson({ questionText: "见图计算", answerText: "略" } as any);
  expect(checker.checkable).toBe(false);
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/ai/math-checker.test.ts`  
Expected: FAIL on latex/power parsing.

**Step 3: Write minimal implementation**

```ts
function normalizeMathExpression(raw: string): string {
  return raw
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/\[/g, "(").replace(/\]/g, ")")
    .replace(/\^/g, "**");
}
```

Add guarded evaluator; if normalization/eval confidence is low -> `checkable=false`.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/ai/math-checker.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/math-checker.ts src/__tests__/unit/ai/math-checker.test.ts
git commit -m "fix(checker): improve expression normalization and safe uncheckable fallback"
```

### Task 4: Add failing tests for diagnosis evidence integrity

**Files:**
- Modify: `src/__tests__/unit/ai/math-checker.test.ts`
- Modify: `src/lib/math-checker.ts`

**Step 1: Write the failing test**

```ts
it("builds diagnosis evidence from checker + mistake step evidence", () => {
  const checker = buildCheckerJson({
    questionText: "2x+3=7",
    answerText: "x=2",
    studentAnswerText: "x=-2"
  } as any);
  const diagnosis = buildDiagnosisJson(
    {
      questionText: "2x+3=7",
      analysis: "学生在移项时把 +3 写成 +3 未变号",
      structuredJson: { mistake: { studentSteps: ["2x+3=7", "2x=7+3"] } }
    } as any,
    checker
  );
  expect(diagnosis.candidates[0].evidence).toContain("step");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/ai/math-checker.test.ts`  
Expected: FAIL due missing step-linked evidence.

**Step 3: Write minimal implementation**

```ts
// include mistake step pointer in evidence:
evidence: `checker:${checker.diff}; step:${firstWrongStep || "n/a"}`
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/ai/math-checker.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/math-checker.ts src/__tests__/unit/ai/math-checker.test.ts
git commit -m "fix(diagnosis): anchor evidence to checker diff and mistake steps"
```

### Task 5: Add failing integration tests for error-item save/update using v2 fields

**Files:**
- Modify: `src/__tests__/integration/error-items.test.ts`
- Modify: `src/app/api/error-items/route.ts`
- Modify: `src/app/api/error-items/[id]/route.ts`

**Step 1: Write the failing test**

```ts
it("persists structuredJson v2 and keeps internal diagnosis hidden in student payload", async () => {
  // create error item with v2 payload
  // assert response includes structuredJson rootCause fields
  // assert no internalCandidates in student-facing DTO
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/integration/error-items.test.ts`  
Expected: FAIL due current response shape.

**Step 3: Write minimal implementation**

```ts
// In route handlers:
// - normalize structuredJson v2
// - regenerate checker with studentAnswerText source
// - strip diagnosis.internalCandidates before returning student payload
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/integration/error-items.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/api/error-items/route.ts src/app/api/error-items/[id]/route.ts src/__tests__/integration/error-items.test.ts
git commit -m "feat(api): persist structured v2 and hide internal diagnosis candidates"
```

### Task 6: Add failing integration tests for root-cause chat APIs

**Files:**
- Create: `src/__tests__/integration/root-cause-chat.test.ts`
- Create: `src/app/api/root-cause-chat/route.ts`
- Create: `src/app/api/error-items/[id]/root-cause-chat/route.ts`

**Step 1: Write the failing test**

```ts
it("returns socratic question without leaking internal candidates (unsaved flow)", async () => {
  // POST /api/root-cause-chat
  // expect assistantQuestion and no internalCandidates
});

it("supports saved-item root-cause continuation", async () => {
  // POST /api/error-items/:id/root-cause-chat
  // expect assistantQuestion + summaryDraft
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/integration/root-cause-chat.test.ts`  
Expected: FAIL (routes missing).

**Step 3: Write minimal implementation**

```ts
// Stateless route: accepts context + turns, returns next guided question
// Saved-item route: fetches item + calls same chat helper
```

Use existing `getAIService()` and strict response sanitizer.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/integration/root-cause-chat.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/api/root-cause-chat/route.ts src/app/api/error-items/[id]/root-cause-chat/route.ts src/__tests__/integration/root-cause-chat.test.ts
git commit -m "feat(api): add dual-entry root-cause chat endpoints"
```

### Task 7: Add failing tests for prompt constraints and parser updates

**Files:**
- Modify: `src/__tests__/unit/ai-prompts.test.ts`
- Modify: `src/lib/ai/prompts.ts`
- Modify: `src/lib/ai/openai-provider.ts`
- Modify: `src/lib/ai/gemini-provider.ts`
- Modify: `src/lib/ai/azure-provider.ts`

**Step 1: Write the failing test**

```ts
it("injects whitelist-only knowledge-point instruction", () => {
  const prompt = generateAnalyzePrompt("zh", 8, "数学", { prefetchedMathTags: ["一次函数", "分式"] });
  expect(prompt).toContain("只能从以上列表选择");
  expect(prompt).toContain("最多 3 个");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/ai-prompts.test.ts`  
Expected: FAIL with missing strict wording.

**Step 3: Write minimal implementation**

```ts
// Prompt: force whitelist, max count, evidence sentence.
// Provider parser: tolerate new XML blocks for mistake/solution where available.
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/ai-prompts.test.ts src/__tests__/unit/ai/providers.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/ai/prompts.ts src/lib/ai/openai-provider.ts src/lib/ai/gemini-provider.ts src/lib/ai/azure-provider.ts src/__tests__/unit/ai-prompts.test.ts
git commit -m "feat(ai): enforce whitelist knowledge tags and parse structured analysis blocks"
```

### Task 8: Add failing UI test/spec checks and refactor correction editor layout

**Files:**
- Modify: `src/components/correction-editor.tsx`
- Modify: `src/lib/translations.ts`
- Modify: `src/types/api.ts`

**Step 1: Write the failing test/spec**

If no component-test harness exists, add a lightweight test for render labels:

```ts
it("does not render duplicate answer/analysis preview cards", () => {
  // render correction editor mock
  // assert old duplicate card titles absent
  // assert F/G/H labels present
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit`  
Expected: FAIL for old layout assumptions.

**Step 3: Write minimal implementation**

```tsx
// keep notebook/grade/paper controls unchanged
// replace duplicate right-pane answer/analysis preview cards
// add F/G/H sections and I entry button
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/correction-editor.tsx src/lib/translations.ts src/types/api.ts
git commit -m "feat(ui): simplify analysis editor and expose F/G/H/I workflow"
```

### Task 9: Update detail page to hide internal candidates and add side-panel dialogue

**Files:**
- Modify: `src/app/error-items/[id]/page.tsx`
- Modify: `src/lib/translations.ts`
- Test: `src/__tests__/integration/error-items.test.ts`

**Step 1: Write the failing test**

```ts
it("shows confirmed root cause and chat entry without exposing internal diagnosis candidates", async () => {
  // fetch detail payload and render
  // expect confirmed cause visible
  // expect internalCandidates absent in UI text
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/integration/error-items.test.ts`  
Expected: FAIL due existing diagnosis card behavior.

**Step 3: Write minimal implementation**

```tsx
// render student-facing root-cause block
// add drawer launcher for chat continuation
// remove raw candidate listing from student UI
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/integration/error-items.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/error-items/[id]/page.tsx src/lib/translations.ts src/__tests__/integration/error-items.test.ts
git commit -m "feat(detail): add root-cause dialogue drawer and hide internal diagnosis candidates"
```

### Task 10: Full regression run and final integration commit

**Files:**
- Modify (if needed): `docs/02_task_list.md`
- Modify (if needed): `docs/01_architecture.md`

**Step 1: Run focused regression suite**

Run:

```bash
npx vitest run src/__tests__/unit/ai/structured-json.test.ts
npx vitest run src/__tests__/unit/ai/math-checker.test.ts
npx vitest run src/__tests__/integration/analyze.test.ts
npx vitest run src/__tests__/integration/error-items.test.ts
npx vitest run src/__tests__/integration/root-cause-chat.test.ts
```

Expected: all PASS.

**Step 2: Run broad suite**

Run: `npx vitest run`  
Expected: no new failures introduced.

**Step 3: Manual smoke checks**

Run app:

```bash
npm run dev
```

Manual verify:
- upload -> crop -> analyze -> F/G/H editable
- notebook/grade/paper unchanged
- root-cause chat works pre-save and post-save
- detail page hides internal candidates

**Step 4: Update docs if behavior differs from current task list**

Document only concrete deltas.

**Step 5: Commit**

```bash
git add docs/01_architecture.md docs/02_task_list.md
git commit -m "docs: align architecture/task list with analysis redesign and root-cause dialogue"
```

