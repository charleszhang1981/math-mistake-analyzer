# Error Item Delete Storage Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Delete Supabase Storage image objects before deleting an error-item record, aborting the delete when real storage errors occur.

**Architecture:** Add a small storage delete helper in `src/lib/supabase-storage.ts`, then call it from `DELETE /api/error-items/[id]/delete` after deduping the relevant image keys. Treat missing objects as already cleaned, but surface real storage failures and skip the database delete in that case.

**Tech Stack:** Next.js App Router, Prisma, Supabase Storage REST API, Vitest

---

### Task 1: Add Storage Delete Helper

**Files:**
- Modify: `src/lib/supabase-storage.ts`

**Step 1: Write the helper**

- Add `deletePrivateObjects({ keys })`.
- Trim and dedupe keys before making the request.
- Call Supabase Storage delete API with the service role key.
- Ignore “object not found” responses.
- Throw on real storage failures.

**Step 2: Keep cache behavior sane**

- Remove signed URL cache entries for deleted keys so stale signed URLs are not reused in-process.

### Task 2: Enforce Strict Delete in Error Item Route

**Files:**
- Modify: `src/app/api/error-items/[id]/delete/route.ts`
- Reference: `src/lib/storage-key.ts`

**Step 1: Collect image keys**

- Read `cropImageKey`, `rawImageKey`, and any key parsed from `originalImageUrl`.
- Deduplicate keys.

**Step 2: Order the delete operations**

- Call `deletePrivateObjects(...)` first when keys exist.
- Only call `prisma.errorItem.delete(...)` after storage cleanup succeeds.
- Return 500 when storage cleanup throws.

### Task 3: Add Delete Route Regression Tests

**Files:**
- Modify: `src/__tests__/integration/error-items.test.ts`

**Step 1: Extend mocks**

- Mock `prisma.errorItem.delete`.
- Mock `deletePrivateObjects`.
- Import `DELETE /api/error-items/[id]/delete`.

**Step 2: Add tests**

- Deleting with raw/crop/original keys calls storage cleanup once with deduped keys, then deletes DB record.
- Deleting an item with no resolvable storage keys skips storage cleanup and still deletes the DB record.
- Storage cleanup failure returns 500 and does not delete the DB record.

### Task 4: Verify

**Files:**
- Modify: none

**Step 1: Run tests**

```bash
npx vitest run src/__tests__/integration/error-items.test.ts
```

Expected: all tests pass.

**Step 2: Run lint**

```bash
npx eslint src/app/api/error-items/[id]/delete/route.ts src/lib/supabase-storage.ts src/__tests__/integration/error-items.test.ts
```

Expected: no new errors from touched files.
