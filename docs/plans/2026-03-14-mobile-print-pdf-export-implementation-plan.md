# Mobile Print PDF Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the print preview page export a screenshot-style PDF on mobile while preserving the existing desktop `window.print()` flow.

**Architecture:** Add a small pure helper for mobile detection and PDF page slicing, then update the print-preview page to choose between desktop print and mobile export. Use `html2canvas` to capture the printable area and `jspdf` to generate a multi-page A4 PDF client-side.

**Tech Stack:** TypeScript, Next.js, React, html2canvas, jspdf, Vitest

---

### Task 1: Add Mobile PDF Helper

**Files:**
- Create: `src/lib/print-pdf.ts`
- Test: `src/__tests__/unit/print-pdf.test.ts`

**Step 1: Add pure helpers**

- Add mobile-like environment detection helper.
- Add A4 page slicing helper based on canvas height/width ratio.
- Add PDF filename helper.

**Step 2: Add unit tests**

- Mobile detection returns true for small/coarse mobile cases.
- Mobile detection returns false for desktop-like cases.
- Page slicing returns one page for short content and multiple slices for tall content.

### Task 2: Install PDF Export Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Add runtime dependencies**

- Install `html2canvas`
- Install `jspdf`

### Task 3: Update Print Preview Page

**Files:**
- Modify: `src/app/print-preview/page.tsx`

**Step 1: Add mobile export branch**

- Keep `window.print()` for desktop.
- On mobile-like devices, capture the print content container only.
- Generate a multi-page A4 PDF and save it.

**Step 2: Add UI feedback**

- Add export-in-progress state.
- Change the mobile button label from print to export wording.
- Prevent repeat taps while export is running.
- Show a clear failure alert if export fails.

### Task 4: Verify

**Files:**
- Modify: none

**Step 1: Run unit tests**

```bash
npx vitest run src/__tests__/unit/print-pdf.test.ts
```

Expected: PASS

**Step 2: Run targeted lint**

```bash
npx eslint src/app/print-preview/page.tsx src/lib/print-pdf.ts src/__tests__/unit/print-pdf.test.ts
```

Expected: no new errors
