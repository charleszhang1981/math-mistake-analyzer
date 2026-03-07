# Detail Save Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure question-text and metadata edits on the error-detail page always refresh the full item state before further edits.

**Architecture:** Reuse the existing `fetchItem` loader after successful saves so the page state is sourced from the latest backend response instead of piecemeal local mutations.

**Tech Stack:** Next.js App Router, React client components, TypeScript

---

### Task 1: Refresh full detail state after metadata save

**Files:**
- Modify: `src/app/error-items/[id]/page.tsx`

**Step 1: Update the save handler**

- Guard against missing `item`.
- Use `item.id` for the PUT request.
- Optimistically sync `gradeSemester` and `paperLevel` into local `item`.
- `await fetchItem(item.id)` after a successful save.
- Disable save/cancel controls while the request is in flight.

**Step 2: Verify behavior**

Run:

```bash
npx eslint src/app/error-items/[id]/page.tsx
```

Expected: no new errors from this change.

### Task 2: Refresh full detail state after question save

**Files:**
- Modify: `src/app/error-items/[id]/page.tsx`

**Step 1: Update the save handler**

- Guard against missing `item`.
- Use `item.id` for the PUT request.
- Optimistically sync `questionText` and `structuredJson.problem.question_markdown` into local `item`.
- `await fetchItem(item.id)` after the optimistic sync.
- Disable save/cancel controls while the request is in flight.

**Step 2: Verify behavior**

Run:

```bash
npx eslint src/app/error-items/[id]/page.tsx
```

Expected: no new errors from this change.
