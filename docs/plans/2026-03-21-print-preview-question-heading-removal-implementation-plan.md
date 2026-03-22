# Print Preview Question Heading Removal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the left-column `原题` heading from print preview so each item is slightly shorter in both modes.

**Architecture:** Update only the shared `PrintItems` renderer in `src/app/print-preview/page.tsx`. Because the screen view, browser print, and mobile PDF export all use this renderer, one JSX change will keep them aligned.

**Tech Stack:** Next.js App Router, React, TypeScript

---

### Task 1: Remove the left-column question heading from the shared renderer

**Files:**
- Modify: `src/app/print-preview/page.tsx`

**Step 1:** Remove the `原题` heading from the mode-1 left section.

**Step 2:** Remove the `原题` heading from the mode-2 left section.

**Step 3:** Keep all other content and controls unchanged.

### Task 2: Verify both modes still render correctly

**Files:**
- No additional files expected

**Step 1:** Confirm mode 1 left column still renders image/text, wrong-position summary, and scale controls.

**Step 2:** Confirm mode 2 left column still renders image/text and scale controls.

### Task 3: Run focused verification

**Files:**
- No additional code changes expected

**Step 1:** Run lint on the touched file.

Run:
```bash
npx eslint src/app/print-preview/page.tsx
```

**Step 2:** Manual sanity check:
- Open print preview mode 1 and mode 2
- Confirm `原题` is gone in both
- Confirm print / PDF export still reflects the same layout
