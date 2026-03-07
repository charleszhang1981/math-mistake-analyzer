# Structured JSON Preserve-on-Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent partial error-item updates from degrading existing G/H/I data, while keeping tag-edit UX stable.

**Architecture:** Add a structured-json merge helper that updates only explicit fields on top of an existing normalized `structuredJson`. Use that helper in `PUT /api/error-items/[id]` instead of blindly rebuilding from `analysis`, and soften tag-suggestion/save UX on the detail page.

**Tech Stack:** Next.js App Router, Prisma, Zod, Vitest, React

---

### Task 1: Add merge helper for structured JSON

**Files:**
- Modify: `src/lib/ai/structured-json.ts`

**Step 1:** Add a helper that merges explicit source fields into an existing `StructuredQuestionJson`.

**Step 2:** Reuse current normalization/inference logic for question text, answer text, and mistake fields.

### Task 2: Replace dangerous PUT fallback

**Files:**
- Modify: `src/app/api/error-items/[id]/route.ts`

**Step 1:** Detect whether the request explicitly updates any structured-data fields.

**Step 2:** If an existing normalized `structuredJson` is present, preserve it and only merge explicit fields.

**Step 3:** Only call `buildStructuredQuestionJson(...)` when no valid existing `structuredJson` exists.

### Task 3: Smooth tag edit UX

**Files:**
- Modify: `src/components/tag-input.tsx`
- Modify: `src/app/error-items/[id]/page.tsx`

**Step 1:** On suggestion fetch failure, clear suggestions silently instead of logging a console error overlay.

**Step 2:** Add in-flight state for tag saving and disable buttons while the request is pending.

### Task 4: Add regression tests

**Files:**
- Modify: `src/__tests__/integration/error-items.test.ts`

**Step 1:** Add a PUT test proving tag-only updates preserve existing G/H/I.

**Step 2:** Add a PUT test proving question-text-only updates keep G/H/I while syncing the structured problem text.

**Step 3:** Run the targeted test file and confirm pass.
