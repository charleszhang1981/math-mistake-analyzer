# Cropper Maximize And Redact Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the crop box default to near-full-image and add rectangle redaction mode that exports cropped-and-redacted images.

**Architecture:** Keep UI state inside `ImageCropper`, but move crop/redaction math into a small utility module with unit tests. The shared cropper stays the single integration point for both upload entry pages.

**Tech Stack:** React, react-image-crop, TypeScript, Vitest

---

### Task 1: Add Crop/Redaction Utility Helpers

**Files:**
- Create: `src/lib/image-cropper-utils.ts`
- Test: `src/__tests__/unit/image-cropper-utils.test.ts`

**Step 1: Add pure helpers**

- Define the redaction rectangle type.
- Add helper for near-full default crop.
- Add helper to normalize drag rectangles.
- Add helper to convert a local redaction rectangle inside the crop area into global image percentages.
- Add helper to project a global redaction rectangle back into the current crop area for display/export.

**Step 2: Add unit tests**

- Verify default crop uses near-full percentages.
- Verify local-to-global redaction conversion.
- Verify projection/clipping of redactions back into the crop area.

### Task 2: Upgrade Shared Cropper Component

**Files:**
- Modify: `src/components/image-cropper.tsx`
- Modify: `src/lib/translations.ts`

**Step 1: Initialize crop correctly**

- Use the new default crop helper on image load.
- Initialize both `crop` and `completedCrop` so clicking confirm immediately uses the crop.

**Step 2: Add redaction mode**

- Add cropper mode state (`crop` / `redact`).
- Render redaction rectangles within the selection overlay.
- Add pointer handlers for drawing rectangles in redact mode.
- Add undo / clear actions.

**Step 3: Export redactions**

- Apply visible redaction rectangles to the export canvas after cropping.
- Keep the raw upload image unchanged.
- Reset cropper-local state on close/reopen.

**Step 4: Add minimal copy**

- Add cropper tool labels and redact hint strings to translations with safe fallbacks.

### Task 3: Verify

**Files:**
- Modify: none

**Step 1: Run unit tests**

```bash
npx vitest run src/__tests__/unit/image-cropper-utils.test.ts
```

Expected: all tests pass.

**Step 2: Run lint**

```bash
npx eslint src/components/image-cropper.tsx src/lib/image-cropper-utils.ts src/__tests__/unit/image-cropper-utils.test.ts
```

Expected: no new errors from touched files.
