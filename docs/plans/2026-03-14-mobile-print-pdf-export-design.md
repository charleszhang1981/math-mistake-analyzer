# Mobile Print PDF Export Design

## Goal

Allow the print preview page to generate a PDF file on mobile devices, while keeping the current desktop behavior unchanged.

## Context

- The current print button on `src/app/print-preview/page.tsx` only calls `window.print()`.
- Desktop browsers usually handle this correctly.
- Mobile browsers often ignore `window.print()` or do nothing visible, so the current button appears broken on phones.

## Chosen Approach

1. Keep desktop behavior unchanged:
   - Continue using `window.print()`.
2. Add a mobile-only export path:
   - Detect mobile-like environments on the client.
   - Capture only the printable content area, not the sticky control bar.
   - Render the captured content into a multi-page A4 PDF on the client.
   - Trigger file download/save from the browser.

## Why This Approach

- It solves the actual failure mode on mobile without risking desktop print behavior.
- It reuses the existing print-preview layout, so no duplicate PDF-only rendering pipeline is needed.
- Screenshot-style PDF is acceptable here and much simpler than rebuilding the whole layout with a PDF drawing library.

## Scope

- Touch only the print preview page and a small PDF utility/helper.
- Add the minimum dependencies needed for client-side screenshot-to-PDF export.
- Add lightweight unit coverage for the pure helper logic.

## Non-Goals

- Do not replace desktop print.
- Do not build a server-side PDF pipeline.
- Do not rebuild the page as a true text-based PDF layout.
