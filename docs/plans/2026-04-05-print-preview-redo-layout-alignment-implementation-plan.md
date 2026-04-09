# Print Preview Redo Layout Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make print-preview mode 2 use a 50:50 layout and derive the blank right-side height from hidden mode-1 answer content instead of a fixed minimum height.

**Architecture:** Refactor the current mode-1 right column into a reusable panel component. Reuse that panel visibly in review mode and invisibly in redo mode so the blank writing area inherits the same content-driven height source. Update the redo grid classes to match the review grid width ratio.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS

---

### Task 1: Extract reusable review-answer panel rendering

**Files:**
- Modify: `src/app/print-preview/page.tsx`

**Step 1:** Create a small reusable component or render helper for the current mode-1 right column.

**Step 2:** Move the existing `标准答案 / 分步解法 / 根因` rendering into that reusable piece.

**Step 3:** Support a hidden placeholder mode using `invisible` so the layout is preserved without visible content.

### Task 2: Align mode 2 columns to 50:50

**Files:**
- Modify: `src/app/print-preview/page.tsx`

**Step 1:** Replace the current redo grid `40:60` classes with the same `50:50` ratio used by review mode.

**Step 2:** Keep mobile-export and print variants aligned with the same ratio.

### Task 3: Replace fixed redo right-side height

**Files:**
- Modify: `src/app/print-preview/page.tsx`

**Step 1:** Remove the current fixed `min-h-[360px]` right-side blank section.

**Step 2:** Render the reusable review-answer panel inside the redo right side as an invisible placeholder so it occupies the same amount of vertical space.

**Step 3:** Ensure the visible result remains a blank bordered writing area.

### Task 4: Run focused verification

**Files:**
- No additional code changes expected

**Step 1:** Run lint on the touched page.

Run:
```bash
npx eslint src/app/print-preview/page.tsx
```

**Step 2:** Manual sanity check:
- mode 2 becomes `50:50`
- mode 2 right side is visually blank
- long-solution items produce taller redo blank areas than short-solution items
- mode 1 remains unchanged visually
