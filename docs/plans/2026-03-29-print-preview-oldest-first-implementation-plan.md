# Print Preview Oldest-First Ordering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make print-preview surfaces render items from oldest to newest while keeping the notebook list newest-first.

**Architecture:** Add an optional sort parameter to the shared error-items list API and keep its default descending behavior. Update only the print-preview page to request ascending creation order so screen preview, browser print, and PDF export stay aligned without affecting other pages.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma

---

### Task 1: Add optional list sorting to the API

**Files:**
- Modify: `src/app/api/error-items/list/route.ts`

**Step 1:** Parse an optional `sort` query parameter from `searchParams`.

**Step 2:** Map known values to Prisma `orderBy`:
- `createdAtAsc` -> `{ createdAt: "asc" }`
- missing or unknown -> `{ createdAt: "desc" }`

**Step 3:** Replace the hard-coded `orderBy` in `findMany` with the computed value.

### Task 2: Make print preview request oldest-first data

**Files:**
- Modify: `src/app/print-preview/page.tsx`

**Step 1:** In the existing print-preview fetch path, append `sort=createdAtAsc`.

**Step 2:** Keep all other query params unchanged so filters, ids, signed images, and page size continue to work.

### Task 3: Verify print-only behavior

**Files:**
- Optionally modify or add targeted tests if an existing list-route test is present

**Step 1:** Check whether there is an existing test around `/api/error-items/list` sort behavior.

**Step 2:** If a suitable test exists, extend it to cover:
- default descending order
- explicit ascending order

**Step 3:** If there is no practical existing test hook, run focused lint and manual verification instead.

### Task 4: Run focused verification

**Files:**
- No additional code changes expected

**Step 1:** Run lint on the touched files.

Run:
```bash
npx eslint src/app/api/error-items/list/route.ts src/app/print-preview/page.tsx
```

**Step 2:** Manual sanity check:
- notebook list remains newest-first
- print preview becomes oldest-first
- print/PDF order matches print preview
