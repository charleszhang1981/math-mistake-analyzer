# Mobile PDF And Crop Stability Design

## Goal

Fix two iPhone-class mobile issues together:

1. Mobile PDF export fails in Safari and WeChat due to unsupported `lab(...)` / `oklch(...)` color parsing inside the screenshot pipeline.
2. Camera-photo crop export drifts vertically, especially in WeChat and still slightly in Safari, causing the wrong question region to be sent to AI.

## Root Cause

### PDF export

- The current mobile export path uses `html2canvas`.
- The app theme is built with Tailwind v4 color output that includes modern color functions such as `lab(...)`, `oklch(...)`, and related color-mix forms.
- On iPhone browsers, `html2canvas` still fails on some of those values during background-color parsing.

### Crop drift

- The cropper currently exports using rendered pixel crop state plus scale factors.
- This is fragile on mobile camera photos because the browser rendering pipeline, image orientation handling, and decoded pixel matrix are not stable enough across Safari and WeChat.
- A low-height selection is especially sensitive to this mismatch, so the exported crop can drift downward.

## Chosen Fix

1. PDF export:
   - Keep desktop `window.print()` unchanged.
   - Keep the mobile screenshot-style PDF path.
   - Before capture, sanitize the cloned export DOM to canvas-safe theme colors using plain hex/rgb values.

2. Crop export:
   - Normalize the cropper source image into a stable local bitmap before the user crops it.
   - Export the crop directly from percentage crop values mapped into the normalized image's natural pixel dimensions.
   - Keep redaction rectangles, but make them follow the same percentage-to-natural-pixel mapping.

## Why This Approach

- It fixes both issues at the layer where they actually break.
- It preserves current product behavior:
  - desktop print remains unchanged
  - raw uploaded image remains unchanged
  - cropper UX remains mostly the same
- It avoids a heavier server-side PDF pipeline and avoids adding a dedicated EXIF-processing dependency unless later proven necessary.
