# Print Preview Heading Removal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the two redundant mode-1 right-column headings in print preview so each item is slightly shorter while keeping print and PDF output consistent.

**Architecture:** Change only the shared `PrintItems` render path in `src/app/print-preview/page.tsx`, so the same markup is used by on-screen preview, browser print, and mobile PDF export. Leave mode 2 and all data/API logic untouched.

**Tech Stack:** Next.js App Router, React, TypeScript

---

### Task 1: Remove the two mode-1 headings from the shared print renderer

**Files:**
- Modify: `src/app/print-preview/page.tsx`

**Step 1:** Remove the `标准解法` section heading from the mode-1 right column.

**Step 2:** Remove the `分步解法` label above the numbered solution steps.

**Step 3:** Keep `标准答案：`, the numbered steps, and `根因：` unchanged.

### Task 2: Verify both layouts still behave correctly

**Files:**
- No new files expected

**Step 1:** Confirm the shared renderer still applies to:
- screen preview
- browser print
- mobile export container

**Step 2:** Confirm mode 2 rendering remains unchanged.

### Task 3: Run focused verification

**Files:**
- No code changes expected

**Step 1:** Run lint on the touched page.

Run:
```bash
npx eslint src/app/print-preview/page.tsx
```

**Step 2:** Manual sanity check:
- Open print preview mode 1
- Confirm `标准解法` and `分步解法` are gone
- Confirm `标准答案：` and `根因：` still render
- Switch to mode 2 and confirm no regression
