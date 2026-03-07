# Analyze Prompt Import Regression Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore the analyze flow by wiring `generateReasonPrompt(...)` back into all provider `analyzeImage(...)` implementations and add regression coverage for prompt routing.

**Architecture:** Fix the missing imports in the three provider adapters, then add unit tests that verify analyze-stage prompt construction still reaches the SDK calls without throwing runtime prompt-reference errors.

**Tech Stack:** TypeScript, provider adapters, Vitest

---

### Task 1: Restore Analyze Prompt Imports

**Files:**
- Modify: `src/lib/ai/openai-provider.ts`
- Modify: `src/lib/ai/gemini-provider.ts`
- Modify: `src/lib/ai/azure-provider.ts`

**Step 1: Re-add `generateReasonPrompt` imports**

- Update each provider import list from `./prompts`.
- Keep existing `generateExtractPrompt`, `generateReanswerPrompt`, and `generateSimilarQuestionPrompt` imports intact.

**Step 2: Verify no other analyze-path prompt references are broken**

- Confirm `analyzeImage(...)` still uses `generateReasonPrompt(...)`.
- Confirm `reanswerQuestion(...)` continues to use `generateReanswerPrompt(...)`.

### Task 2: Add Analyze Prompt Routing Regression Tests

**Files:**
- Create: `src/__tests__/unit/ai/analyze-prompt-routing.test.ts`

**Step 1: Add provider-level routing tests**

- Mock each provider SDK call.
- Execute `analyzeImage(...)` with a minimal stage1 and stage2 fake response.
- Assert the provider reaches stage2 and the system prompt includes known analyze-template text.

**Step 2: Cover all three providers**

- OpenAI provider
- Gemini provider
- Azure provider

### Task 3: Verify

**Files:**
- Modify: none

**Step 1: Run regression test**

```bash
npx vitest run src/__tests__/unit/ai/analyze-prompt-routing.test.ts
```

Expected: PASS

**Step 2: Run targeted lint**

```bash
npx eslint src/lib/ai/openai-provider.ts src/lib/ai/gemini-provider.ts src/lib/ai/azure-provider.ts src/__tests__/unit/ai/analyze-prompt-routing.test.ts
```

Expected: no new errors
