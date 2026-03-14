# Mobile PDF And Crop Stability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make mobile PDF export work on iPhone Safari/WeChat and stop mobile camera-photo crop output from drifting away from the user-selected region.

**Architecture:** Add a canvas-safe theme sanitizer to the mobile PDF helper and switch the cropper to a normalized source bitmap plus percentage-to-natural-pixel export. Keep desktop print and raw-upload storage behavior unchanged.

**Tech Stack:** TypeScript, React, Next.js, html2canvas, jspdf, Vitest

---

### Task 1: Add Canvas-Safe PDF Theme Helper

**Files:**
- Modify: `src/lib/print-pdf.ts`
- Modify: `src/__tests__/unit/print-pdf.test.ts`

**Step 1: Add theme fallback helper**

- Define a small map of canvas-safe theme variables using plain hex values.
- Add a helper that applies those variables to a cloned document root for export.

**Step 2: Add unit coverage**

- Assert the theme helper writes expected CSS custom properties to a root element.

### Task 2: Use Canvas-Safe Export In Print Preview

**Files:**
- Modify: `src/app/print-preview/page.tsx`

**Step 1: Sanitize the cloned export DOM**

- Pass `onclone` to `html2canvas`.
- Apply canvas-safe theme variables to the cloned document root.
- Keep the existing mobile export branch and desktop print branch.

### Task 3: Stabilize Crop Export

**Files:**
- Modify: `src/lib/image-cropper-utils.ts`
- Modify: `src/components/image-cropper.tsx`
- Modify: `src/__tests__/unit/image-cropper-utils.test.ts`

**Step 1: Add percentage-to-natural-pixel mapping**

- Convert the active crop directly into natural pixel coordinates.
- Convert redaction rectangles using the same normalized coordinate system.

**Step 2: Normalize cropper source image**

- Build a normalized bitmap/data URL for the cropper source before user interaction.
- Use that normalized source for both preview and export.

**Step 3: Add unit coverage**

- Verify a shallow crop converts to the expected natural pixel rectangle.
- Verify percentage rectangles map correctly into exported pixel space.

### Task 4: Verify

**Files:**
- Modify: none

**Step 1: Run unit tests**

```bash
npx vitest run src/__tests__/unit/print-pdf.test.ts src/__tests__/unit/image-cropper-utils.test.ts
```

Expected: PASS

**Step 2: Run targeted lint**

```bash
npx eslint src/app/print-preview/page.tsx src/lib/print-pdf.ts src/components/image-cropper.tsx src/lib/image-cropper-utils.ts src/__tests__/unit/print-pdf.test.ts src/__tests__/unit/image-cropper-utils.test.ts
```

Expected: no new errors
