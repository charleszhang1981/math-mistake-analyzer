# Print Image Scale Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为每道题增加可持久化的打印图片比例设置，使打印页、浏览器打印预览和 PDF 导出都使用同一份用户调整后的比例。

**Architecture:** 在 `ErrorItem` 模型新增 `printImageScale` 可选整数百分比字段，复用现有错误项更新接口保存比例。打印预览页按“数据库值优先、fontSizeHint 回退”的方式计算图片宽度，并提供每题 `+ / -` 按钮做即时保存。

**Tech Stack:** Next.js App Router、React、TypeScript、Prisma、PostgreSQL、Tailwind CSS、Vitest、ESLint

---

### Task 1: 写设计文档与实施计划

**Files:**
- Create: `docs/plans/2026-03-21-print-image-scale-persistence-design.md`
- Create: `docs/plans/2026-03-21-print-image-scale-persistence-implementation-plan.md`

**Step 1: 写设计文档**

记录目标、字段选型、回退规则和 UI 范围。

**Step 2: 写实施计划**

拆成 schema、API、打印页、验证四部分。

### Task 2: 扩展 Prisma 模型与迁移 SQL

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260321000100_add_print_image_scale_to_error_item/migration.sql`

**Step 1: 修改 Prisma schema**

为 `ErrorItem` 新增 `printImageScale Int?`

**Step 2: 编写迁移 SQL**

```sql
ALTER TABLE "ErrorItem"
ADD COLUMN "printImageScale" INTEGER;
```

**Step 3: 生成 Prisma Client**

```bash
npx prisma generate
```

### Task 3: 接通 API 与类型

**Files:**
- Modify: `src/types/api.ts`
- Modify: `src/app/api/error-items/route.ts`
- Modify: `src/app/api/error-items/[id]/route.ts`

**Step 1: 更新前端类型**

在 `ErrorItem`、`CreateErrorItemRequest` 等相关类型里加入 `printImageScale`

**Step 2: 创建接口支持字段**

确保创建错题时可选写入 `printImageScale`

**Step 3: 更新接口支持字段**

确保 `PUT /api/error-items/[id]` 可以单独更新 `printImageScale`

### Task 4: 在打印页加入每题比例按钮与自动保存

**Files:**
- Modify: `src/app/print-preview/page.tsx`

**Step 1: 计算当前生效比例**

- 若 `item.printImageScale` 存在，使用它
- 否则按 `fontSizeHint` 回退到 60 / 80 / 90

**Step 2: 增加本地状态**

- 管理每题当前比例
- 管理每题保存中状态

**Step 3: 增加 `+ / -` 按钮**

- 位置放在原图卡片右下角
- 只在屏幕显示，不进入打印内容
- 采用固定步进，例如 `5%`
- 设置上下界，避免过大或过小

**Step 4: 自动保存**

- 点击后立即更新本地状态
- 发送 `PUT /api/error-items/[id]` 保存 `printImageScale`
- 保存失败时回滚本地状态并提示用户

### Task 5: 运行验证

**Files:**
- Modify: `src/app/print-preview/page.tsx`
- Modify: `src/app/api/error-items/[id]/route.ts`
- Modify: `src/types/api.ts`
- Modify: `prisma/schema.prisma`

**Step 1: 运行 Prisma generate**

```bash
npx prisma generate
```

**Step 2: 运行相关测试**

```bash
npx vitest run src/__tests__/integration/error-items.test.ts src/__tests__/unit/print-pdf.test.ts
```

**Step 3: 运行 eslint**

```bash
npx eslint src/app/print-preview/page.tsx src/app/api/error-items/[id]/route.ts src/app/api/error-items/route.ts src/types/api.ts
```

**Step 4: 人工验证**

- 打印页点击某题 `+ / -`
- 当前页面图片大小立即变化
- 打开浏览器打印预览，比例一致
- 保存 PDF，比例一致
- 刷新页面或重新进入打印页，比例仍保留
