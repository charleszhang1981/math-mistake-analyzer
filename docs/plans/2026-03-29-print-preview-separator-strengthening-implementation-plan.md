# Print Preview Separator Strengthening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the separator lines between print-preview items thicker and darker without increasing item height.

**Architecture:** Adjust only the shared item wrapper class in `src/app/print-preview/page.tsx`, because all print-preview surfaces already use the same `PrintItems` renderer. Keep the current DOM structure and only strengthen the existing bottom border.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS

---

### Task 1: Strengthen the shared item separator

**Files:**
- Modify: `src/app/print-preview/page.tsx`

**Step 1:** Update the item wrapper classes for both screen and mobile-export layouts.

**Step 2:** Change the separator from the current light `border-b` to a thicker and darker bottom border.

**Step 3:** Keep spacing and `last:border-b-0` behavior unchanged.

### Task 2: Verify shared render behavior

**Files:**
- No new files expected

**Step 1:** Confirm the same stronger separator applies to:
- screen preview
- browser print
- mobile export container

**Step 2:** Confirm internal section borders are unchanged.

### Task 3: Run focused verification

**Files:**
- No additional code changes expected

**Step 1:** Run lint on the touched page.

Run:
```bash
npx eslint src/app/print-preview/page.tsx
```

**Step 2:** Manual sanity check:
- Open print preview with multiple items
- Confirm item separators are more obvious
- Confirm per-item height does not increase
