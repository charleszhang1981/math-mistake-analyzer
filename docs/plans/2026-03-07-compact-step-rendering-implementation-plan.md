# Compact Step Rendering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make G/H numbered steps render densely and consistently across the main detail, correction editor, practice, and print preview views.

**Architecture:** Introduce a shared compact numbered-step component and a scoped compact mode in `MarkdownRenderer`. Replace page-local step list rendering with the shared component so numbering, spacing, and paragraph behavior stay aligned everywhere.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, react-markdown, KaTeX

---

### Task 1: Add shared compact step rendering primitives

**Files:**
- Modify: `C:\Projects\math-mistake-analyzer\src\components\markdown-renderer.tsx`
- Create: `C:\Projects\math-mistake-analyzer\src\components\compact-numbered-steps.tsx`

**Step 1: Add a compact rendering mode to `MarkdownRenderer`**

- Add a boolean prop for compact rendering.
- Use tighter paragraph, list, and list-item classes only when compact mode is requested.
- Support inline paragraphs so step text does not drop under the numeric marker.

**Step 2: Create `CompactNumberedSteps`**

- Accept `steps`, optional class names, and an optional line normalizer.
- Render each step as `number + content` in a flex row.
- Render content with `MarkdownRenderer` in compact mode.

### Task 2: Migrate all step-based views

**Files:**
- Modify: `C:\Projects\math-mistake-analyzer\src\app\error-items\[id]\page.tsx`
- Modify: `C:\Projects\math-mistake-analyzer\src\components\correction-editor.tsx`
- Modify: `C:\Projects\math-mistake-analyzer\src\app\practice\page.tsx`
- Modify: `C:\Projects\math-mistake-analyzer\src\app\print-preview\page.tsx`

**Step 1: Replace G solution list rendering**

- Stop using Markdown ordered-list strings for read-only solution steps.
- Feed step arrays into the shared compact numbered-step component.

**Step 2: Replace H student-step rendering**

- Swap the duplicated flex-row markup for the shared component.
- Keep existing text normalization so saved data behavior does not change.

**Step 3: Remove page-specific list CSS that becomes obsolete**

- Drop print-preview ordered-list overrides once the shared renderer is in use.

### Task 3: Verify behavior

**Files:**
- No new files

**Step 1: Run targeted checks**

- Run lint or targeted type checks for touched files if practical.
- Manually inspect the affected routes in the browser.

**Step 2: Confirm visual acceptance criteria**

- G markers stay inline with content.
- H spacing is compact.
- Print preview remains legible.
