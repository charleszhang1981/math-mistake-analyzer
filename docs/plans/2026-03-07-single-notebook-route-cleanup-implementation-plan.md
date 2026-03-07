# Single Notebook Route Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the legacy multi-notebook list page from the user flow and route all notebook entry points to the single Math notebook detail page.

**Architecture:** Keep the existing `/notebooks/[id]` detail page as the canonical notebook page. Convert `/notebooks` into a redirect shell that resolves the sole notebook via `/api/notebooks`, and point print-preview back navigation directly at the current notebook when possible.

**Tech Stack:** Next.js App Router, client navigation, existing `/api/notebooks` endpoint, ESLint

---

### Task 1: Convert `/notebooks` into a redirect entry

**Files:**
- Modify: `src/app/notebooks/page.tsx`

**Step 1:** Replace the legacy list-page UI with a lightweight redirect screen.

**Step 2:** Fetch `/api/notebooks`, read the first notebook id, and call `router.replace("/notebooks/<id>")`.

**Step 3:** Keep a minimal loading/failure UI so the page never flashes the old notebook list.

### Task 2: Fix print-preview back navigation

**Files:**
- Modify: `src/app/print-preview/page.tsx`

**Step 1:** Read `subjectId` from `searchParams`.

**Step 2:** Compute `fallbackUrl` as `/notebooks/<subjectId>` when available, otherwise `/notebooks`.

**Step 3:** Pass that URL into `BackButton`.

### Task 3: Verify route cleanup

**Files:**
- No code file; validation only

**Step 1:** Run ESLint on the changed pages.

**Step 2:** Manually verify `/notebooks` and print-preview back navigation no longer expose the legacy list page.
