# Mobile PDF Block Pagination Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让手机端 PDF 以“整题”为主要分页单位，避免普通题在页面中间被切断。

**Architecture:** 在打印页导出容器中给每道题添加块标记，导出时测量这些题块的位置与高度，并基于题块边界而不是固定像素高度来计算 PDF page slices；超长题再退回到题内切片。

**Tech Stack:** Next.js App Router、React、TypeScript、Tailwind CSS、html2canvas、jsPDF、Vitest、ESLint

---

### Task 1: 补充分页设计与实施计划

**Files:**
- Create: `docs/plans/2026-03-14-mobile-pdf-block-pagination-design.md`
- Create: `docs/plans/2026-03-14-mobile-pdf-block-pagination-implementation-plan.md`

**Step 1: 写设计文档**

明确“按题块分页”的动机、方案对比、推荐方案与兜底策略。

**Step 2: 写实施计划**

将实现拆成块标记、分页 helper、导出接线、测试四部分。

### Task 2: 新增按题块分页的 helper 与测试

**Files:**
- Modify: `src/lib/print-pdf.ts`
- Test: `src/__tests__/unit/print-pdf.test.ts`

**Step 1: 写失败测试**

为新的分页 helper 补测试，至少覆盖：
- 多个块都能整题放下
- 下一题放不下时整题换页
- 超长块会退回为多页切片

**Step 2: 实现 helper**

在 `print-pdf.ts` 中新增块分页类型与计算函数，输出 `PdfPageSlice[]`。

**Step 3: 运行测试**

```bash
npx vitest run src/__tests__/unit/print-pdf.test.ts
```

预期：PASS

### Task 3: 给打印项加块标记并切换移动端导出算法

**Files:**
- Modify: `src/app/print-preview/page.tsx`
- Modify: `src/lib/print-pdf.ts`

**Step 1: 给每道题的外层容器加导出标记**

例如 `data-print-item="true"`，保证隐藏导出容器里可以稳定查询到。

**Step 2: 在移动端导出前测量块**

从 `mobileExportContentRef` 查询全部题块，取相对导出容器的 `top` 与 `height`。

**Step 3: 映射到 canvas 像素空间并替换切片策略**

把测量结果按 canvas/DOM 比例映射后，调用新的块分页 helper 生成 page slices。

**Step 4: 保留超长题兜底**

若单题高于一页，允许它内部继续分页，不阻塞导出。

### Task 4: 运行静态检查与人工验证

**Files:**
- Modify: `src/app/print-preview/page.tsx`
- Modify: `src/lib/print-pdf.ts`
- Test: `src/__tests__/unit/print-pdf.test.ts`

**Step 1: 运行测试**

```bash
npx vitest run src/__tests__/unit/print-pdf.test.ts
```

预期：PASS

**Step 2: 运行 eslint**

```bash
npx eslint src/app/print-preview/page.tsx src/lib/print-pdf.ts src/__tests__/unit/print-pdf.test.ts
```

预期：无新 error；仅允许既有 `<img>` warning。

**Step 3: 人工验证**

- 用此前会被截断的题复测手机导出
- 确认普通题不再被切成上下两半
- 观察页尾余白是否处于可接受范围

**Step 4: Commit**

```bash
git add src/app/print-preview/page.tsx src/lib/print-pdf.ts src/__tests__/unit/print-pdf.test.ts docs/plans/2026-03-14-mobile-pdf-block-pagination-design.md docs/plans/2026-03-14-mobile-pdf-block-pagination-implementation-plan.md
git commit -m "feat: paginate mobile pdf by print items"
```
