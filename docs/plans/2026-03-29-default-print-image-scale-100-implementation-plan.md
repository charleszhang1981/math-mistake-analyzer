# Default Print Image Scale 100 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change the fallback print image scale from `80` to `100` while keeping persisted per-item scales unchanged.

**Architecture:** Update the shared print-image-scale helper constant only, then adjust the unit test that asserts fallback behavior. No API, database, or page-level logic changes are required because all print rendering already flows through `resolvePrintImageScale(...)`.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Change the fallback default

**Files:**
- Modify: `src/lib/print-image-scale.ts`

**Step 1:** Change `DEFAULT_PRINT_IMAGE_SCALE` from `80` to `100`.

**Step 2:** Leave `normalizePrintImageScale(...)` and persisted-value precedence unchanged.

### Task 2: Update unit coverage

**Files:**
- Modify: `src/__tests__/unit/print-image-scale.test.ts`

**Step 1:** Update the fallback assertions so missing persisted values resolve to `100`.

**Step 2:** Keep assertions for persisted values and clamping unchanged.

### Task 3: Verify

**Files:**
- No additional files expected

**Step 1:** Run the focused unit test.

Run:
```bash
npx vitest run src/__tests__/unit/print-image-scale.test.ts
```

**Step 2:** Run lint on the touched helper and test.

Run:
```bash
npx eslint src/lib/print-image-scale.ts src/__tests__/unit/print-image-scale.test.ts
```
