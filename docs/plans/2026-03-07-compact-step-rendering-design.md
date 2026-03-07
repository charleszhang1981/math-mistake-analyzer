# Compact Step Rendering Design

## Goal

Unify the G/H step presentation so numbered steps stay on one line with their content and the vertical spacing is noticeably denser across the error detail page, correction editor, practice page, and print preview.

## Problem

- G currently renders step-by-step solutions through Markdown ordered lists in some views, which lets paragraph styles force the text onto a new line after the numeric marker.
- H currently renders each student step with a custom flex row, but the nested Markdown paragraph spacing still makes the list too tall.
- Print preview already has separate CSS overrides, so step rendering behavior is drifting between pages.

## Decision

Use one shared compact numbered-step renderer instead of relying on page-specific Markdown list styling.

- Add a reusable component that renders numbered steps with fixed marker width and compact vertical gaps.
- Extend `MarkdownRenderer` with a scoped compact mode so step content can reuse Markdown/KaTeX support without changing default Markdown styling elsewhere.
- Migrate all G/H step views to the shared renderer.

## Scope

- `src/components/markdown-renderer.tsx`
- `src/components/compact-numbered-steps.tsx`
- `src/app/error-items/[id]/page.tsx`
- `src/components/correction-editor.tsx`
- `src/app/practice/page.tsx`
- `src/app/print-preview/page.tsx`

## Non-Goals

- No change to AI output structure or stored `structuredJson`.
- No global typography redesign for all Markdown content.
- No change to editing textareas, only read-mode rendering.

## Validation

- G steps: the number and text stay on the same visual line.
- H steps: line-to-line spacing is compact and consistent with G.
- Print preview stays readable when printed and no longer depends on ad hoc ordered-list CSS.
