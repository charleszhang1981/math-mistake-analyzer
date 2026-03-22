# Font Size Hint Removal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop generating and consuming `fontSizeHint` so print image sizing is controlled only by persisted `printImageScale`.

**Architecture:** Remove `fontSizeHint` from the AI extract/parse pipeline and stop writing it into new `structuredJson` payloads. Keep legacy payloads readable, but ignore the field when normalizing and rendering. Make print preview fall back to a fixed default scale of `80` when no per-item `printImageScale` is saved.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, Zod, Vitest

---

### Task 1: Remove AI prompt and schema support for font size hint

**Files:**
- Modify: `src/lib/ai/prompts.ts`
- Modify: `src/lib/ai/schema.ts`

**Step 1:** Remove `<question_font_size_hint>` instructions and tag from the extract prompt.

**Step 2:** Remove `fontSizeHint` from `ImageExtractSchema` and `ParsedQuestionSchema`.

**Step 3:** Run focused tests for AI prompt/schema behavior.

Run:
```bash
npx vitest run src/__tests__/unit/ai/analyze-prompt-routing.test.ts src/__tests__/unit/ai/two-stage-schema.test.ts
```

### Task 2: Remove provider parsing/merging of font size hint

**Files:**
- Modify: `src/lib/ai/openai-provider.ts`
- Modify: `src/lib/ai/gemini-provider.ts`
- Modify: `src/lib/ai/azure-provider.ts`

**Step 1:** Delete `parseFontSizeHint(...)` helpers.

**Step 2:** Remove `question_font_size_hint` extraction from stage1 parse and legacy parse helpers.

**Step 3:** Remove `fontSizeHint` from merged analyze results.

**Step 4:** Update analyze routing fixtures so stage1 XML no longer includes the tag.

### Task 3: Stop structuredJson from producing or preserving font size hint

**Files:**
- Modify: `src/lib/ai/structured-json.ts`
- Modify: `src/components/correction-editor.tsx`
- Modify: `src/app/api/error-items/[id]/route.ts`

**Step 1:** Remove `fontSizeHint` from structured problem schema and `StructuredSource`.

**Step 2:** Delete normalization helpers dedicated to `fontSizeHint`.

**Step 3:** Update `buildStructuredQuestionJson(...)` and `mergeStructuredQuestionJson(...)` so they no longer write or preserve it.

**Step 4:** Remove callers that explicitly pass `fontSizeHint` while rebuilding structured data.

**Step 5:** Keep normalization compatible with old payloads by relying on object parsing that strips unknown keys.

### Task 4: Simplify print scale fallback to persisted value or 80

**Files:**
- Modify: `src/lib/print-image-scale.ts`
- Modify: `src/app/print-preview/page.tsx`

**Step 1:** Replace font-size-hint-based fallback with a fixed default scale constant (`80`).

**Step 2:** Remove remaining reads of `structured?.problem.fontSizeHint` from the print preview page.

**Step 3:** Keep existing `+ / -` persistence behavior unchanged.

### Task 5: Update tests and docs

**Files:**
- Modify: `src/__tests__/unit/ai/analyze-prompt-routing.test.ts`
- Modify: `src/__tests__/unit/ai/structured-json.test.ts`
- Modify: `src/__tests__/unit/ai/two-stage-schema.test.ts`
- Modify: `src/__tests__/unit/reanswer-utils.test.ts`
- Modify: `docs/01_architecture.md`
- Modify: `docs/03_data_model_and_config.md`

**Step 1:** Remove old assertions that expect `fontSizeHint`.

**Step 2:** Add regression coverage for legacy structured payloads that still contain `fontSizeHint`.

**Step 3:** Update docs so `fontSizeHint` is no longer described as active behavior.

### Task 6: Verify end-to-end local behavior

**Files:**
- No code changes expected

**Step 1:** Run focused tests.

Run:
```bash
npx vitest run src/__tests__/unit/ai/analyze-prompt-routing.test.ts src/__tests__/unit/ai/structured-json.test.ts src/__tests__/unit/ai/two-stage-schema.test.ts src/__tests__/unit/reanswer-utils.test.ts
```

**Step 2:** Run lint on touched files.

Run:
```bash
npx eslint src/lib/ai/prompts.ts src/lib/ai/schema.ts src/lib/ai/openai-provider.ts src/lib/ai/gemini-provider.ts src/lib/ai/azure-provider.ts src/lib/ai/structured-json.ts src/components/correction-editor.tsx src/app/api/error-items/[id]/route.ts src/lib/print-image-scale.ts src/app/print-preview/page.tsx src/__tests__/unit/ai/analyze-prompt-routing.test.ts src/__tests__/unit/ai/structured-json.test.ts src/__tests__/unit/ai/two-stage-schema.test.ts src/__tests__/unit/reanswer-utils.test.ts
```

**Step 3:** Manual sanity check:
- 打开打印预览页
- 未调比例的题默认按 `80%`
- 点击 `+ / -` 后仍可保存并刷新后保留
