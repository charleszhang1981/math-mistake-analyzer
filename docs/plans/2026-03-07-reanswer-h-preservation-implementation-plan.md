# Reanswer H Preservation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure `reanswer` uses the dedicated reanswer prompt and does not overwrite a valid existing H block with empty or placeholder H output.

**Architecture:** Move H-preservation rules into a small pure utility, wire provider `reanswerQuestion(...)` methods to `generateReanswerPrompt(...)`, then apply the merge utility in `CorrectionEditor` before rebuilding `structuredJson`.

**Tech Stack:** TypeScript, React, provider adapters, Vitest

---

### Task 1: Add Reanswer Merge Utility

**Files:**
- Create: `src/lib/reanswer-utils.ts`
- Test: `src/__tests__/unit/reanswer-utils.test.ts`

**Step 1: Add helper functions**

- Detect placeholder-like H steps such as `(无)`, `none`, `n/a`, `无学生步骤供分析`.
- Decide whether returned H is meaningful.
- Resolve the final H block by preserving previous H when new H is placeholder-only.

**Step 2: Add unit tests**

- New meaningful H should replace old H.
- Placeholder-only H should preserve old H.
- Placeholder-only H with no previous meaningful H should collapse to empty strings instead of placeholder text.

### Task 2: Fix Provider Prompt Routing

**Files:**
- Modify: `src/lib/ai/openai-provider.ts`
- Modify: `src/lib/ai/gemini-provider.ts`
- Modify: `src/lib/ai/azure-provider.ts`
- Modify: `src/lib/ai/prompts.ts`

**Step 1: Correct prompt generator**

- Replace `generateReasonPrompt(...)` with `generateReanswerPrompt(...)` in all `reanswerQuestion(...)` implementations.
- Stop passing `prompts.analyze` as the custom template for reanswer.

**Step 2: Strengthen prompt wording**

- Add explicit reanswer rules to recover student work from image/question context.
- Ban placeholder-only H outputs.
- Require the model to infer the most likely wrong path if student work is partial.

### Task 3: Apply H Preservation In Correction Editor

**Files:**
- Modify: `src/components/correction-editor.tsx`

**Step 1: Merge H safely**

- Before rebuilding `structuredJson`, resolve H fields with the new utility.
- Preserve prior H when the new reanswer H is empty or placeholder-only.
- Continue to update G and other fields normally.

### Task 4: Add Prompt-Routing Regression Tests

**Files:**
- Create: `src/__tests__/unit/ai/reanswer-prompt-routing.test.ts`

**Step 1: Verify providers use reanswer prompt**

- Mock provider SDK calls.
- Assert the system prompt used by each provider’s `reanswerQuestion(...)` contains `Subject hint:` from the dedicated reanswer prompt.

### Task 5: Verify

**Files:**
- Modify: none

**Step 1: Run tests**

```bash
npx vitest run src/__tests__/unit/reanswer-utils.test.ts src/__tests__/unit/ai/reanswer-prompt-routing.test.ts
```

Expected: all tests pass.

**Step 2: Run lint**

```bash
npx eslint src/components/correction-editor.tsx src/lib/reanswer-utils.ts src/lib/ai/openai-provider.ts src/lib/ai/gemini-provider.ts src/lib/ai/azure-provider.ts src/lib/ai/prompts.ts src/__tests__/unit/reanswer-utils.test.ts src/__tests__/unit/ai/reanswer-prompt-routing.test.ts
```

Expected: no new errors from touched files.
