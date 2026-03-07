# Analyze Prompt Import Regression Design

## Goal

Fix the home upload analyze flow so it no longer fails with `AI_UNKNOWN_ERROR` after stage1 succeeds and stage2 prompt generation starts.

## Root Cause

- The three AI providers call `generateReasonPrompt(...)` inside `analyzeImage(...)`.
- During a recent prompt-routing edit, the `generateReasonPrompt` import was removed from:
  - `src/lib/ai/openai-provider.ts`
  - `src/lib/ai/gemini-provider.ts`
  - `src/lib/ai/azure-provider.ts`
- At runtime, stage1 extraction succeeds, then stage2 prompt construction throws `ReferenceError: generateReasonPrompt is not defined`.
- `/api/analyze` catches that runtime error and normalizes it to `AI_UNKNOWN_ERROR`, so the frontend only shows a generic unknown-AI error.

## Chosen Fix

1. Restore `generateReasonPrompt` imports in all three provider files.
2. Add regression tests that exercise analyze-stage prompt routing so this cannot silently regress again.

## Why This Approach

- The failure is narrow and well-localized.
- No prompt semantics need to change for this bug.
- A small regression test is enough to prevent the same class of runtime breakage after future prompt refactors.
