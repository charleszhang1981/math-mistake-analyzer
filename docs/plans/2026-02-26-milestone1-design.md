# Milestone 1 (Supabase + C1) Design

## Scope
- Switch persistence to Supabase Postgres (Prisma datasource `postgresql`).
- Add Supabase Storage private upload/sign endpoints.
- Enforce C1 config policy: env-only, no local file persistence.
- Lock subject flow to math-only (`Math` / internal key `math`).

## Decisions
- Migrations are reset to a PostgreSQL baseline migration because historical SQLite migrations are not executable on Postgres.
- `ErrorItem` is extended with:
  - `rawImageKey`
  - `cropImageKey`
  - `structuredJson`
  - `checkerJson`
  - `diagnosisJson`
- Storage uses server-side service role via REST (no local disk dependency).
- `/api/settings` POST is disabled (`CONFIG_ENV_ONLY`) and settings UI save actions are disabled.
- Notebook APIs ensure a single `Math` notebook path and block creation/deletion of other subjects.

## Files
- Prisma:
  - `prisma/schema.prisma`
  - `prisma/migrations/migration_lock.toml`
  - `prisma/migrations/20260226000100_postgres_baseline/migration.sql`
- Storage:
  - `src/lib/supabase-storage.ts`
  - `src/app/api/images/upload/route.ts`
  - `src/app/api/images/signed/route.ts`
- Config (C1):
  - `src/lib/config.ts`
  - `src/app/api/settings/route.ts`
  - `src/components/settings-dialog.tsx`
- Math-only:
  - `src/app/api/notebooks/route.ts`
  - `src/app/api/notebooks/[id]/route.ts`
  - `src/app/notebooks/page.tsx`
  - `src/app/api/tags/route.ts`
  - `src/app/api/tags/suggestions/route.ts`
  - `src/app/tags/page.tsx`
  - `src/app/api/error-items/route.ts`
  - `src/app/api/error-items/[id]/route.ts`
  - `src/app/api/analyze/route.ts`

