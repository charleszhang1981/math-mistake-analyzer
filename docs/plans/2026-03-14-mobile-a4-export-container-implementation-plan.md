# Mobile A4 Export Container Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让手机端 PDF 导出捕获隐藏的固定 A4/桌面布局容器，而不是当前窄屏预览，从而让导出页数和桌面打印效果接近。

**Architecture:** 在打印页中抽出共享的题目渲染结构，同时保留一个可见预览容器和一个隐藏的 A4 导出容器。移动端导出时改为截取隐藏容器；桌面端继续走 `window.print()`。

**Tech Stack:** Next.js App Router、React、TypeScript、Tailwind CSS、html2canvas、jsPDF、Vitest、ESLint

---

### Task 1: 补充设计文档并锁定实现边界

**Files:**
- Create: `docs/plans/2026-03-14-mobile-a4-export-container-design.md`
- Create: `docs/plans/2026-03-14-mobile-a4-export-container-implementation-plan.md`

**Step 1: 写设计文档**

记录问题、方案对比、推荐方案、布局策略与风险边界。

**Step 2: 写实施计划**

把后续实现拆成共享渲染、隐藏容器、移动端导出、测试四块。

**Step 3: Commit**

```bash
git add docs/plans/2026-03-14-mobile-a4-export-container-design.md docs/plans/2026-03-14-mobile-a4-export-container-implementation-plan.md
git commit -m "docs: plan mobile a4 export container"
```

### Task 2: 提取打印页共享渲染并新增隐藏导出容器

**Files:**
- Modify: `src/app/print-preview/page.tsx`

**Step 1: 写失败前的目标检查**

手工确认当前移动端导出仍使用 `printContentRef`，且打印页 JSX 只有一份可见容器。

**Step 2: 提取共享渲染**

在 `page.tsx` 中抽出题目列表渲染函数或内部组件，参数至少包括：
- `items`
- `printMode`
- `layout`（`screen` / `mobile-export`）

**Step 3: 增加第二个 ref**

新增移动端导出专用 ref，例如 `mobileExportContentRef`。

**Step 4: 渲染隐藏容器**

在页面末尾渲染一个脱离视口但可被 `html2canvas` 捕获的容器，固定桌面/A4 宽度并强制两栏布局。

**Step 5: 本地检查 JSX 结构**

确认可见预览继续响应式显示；隐藏容器不参与交互、不影响页面布局。

### Task 3: 调整移动端 PDF 导出源为隐藏 A4 容器

**Files:**
- Modify: `src/app/print-preview/page.tsx`
- Modify: `src/lib/print-pdf.ts`
- Test: `src/__tests__/unit/print-pdf.test.ts`

**Step 1: 写失败测试或纯函数断言**

如果新增了导出宽度/布局纯函数，就先为其补测试。

**Step 2: 实现最小改动**

- 桌面端继续 `window.print()`
- 手机端导出时优先读取 `mobileExportContentRef`
- 为导出容器增加稳定宽度与主题变量覆盖

**Step 3: 更新 `print-pdf` 工具函数**

如果需要，把 A4 导出宽度、导出 root class 或安全样式覆盖提成可测试的 helper。

**Step 4: 运行测试**

```bash
npx vitest run src/__tests__/unit/print-pdf.test.ts
```

预期：PASS

### Task 4: 运行静态检查并人工验证

**Files:**
- Modify: `src/app/print-preview/page.tsx`
- Modify: `src/lib/print-pdf.ts`
- Test: `src/__tests__/unit/print-pdf.test.ts`

**Step 1: 运行 eslint**

```bash
npx eslint src/app/print-preview/page.tsx src/lib/print-pdf.ts src/__tests__/unit/print-pdf.test.ts
```

预期：无新的 error；仅允许已存在且无关的 `<img>` warning。

**Step 2: 人工验证桌面端**

- 打开打印页
- 点击右上角按钮
- 预期：仍然弹出浏览器打印对话框

**Step 3: 人工验证手机端**

- 打开同一批题目的打印页
- 点击右上角按钮
- 预期：导出的 PDF 页数明显接近桌面端，而不是窄屏单列拉长版本

**Step 4: Commit**

```bash
git add src/app/print-preview/page.tsx src/lib/print-pdf.ts src/__tests__/unit/print-pdf.test.ts
git commit -m "feat: export mobile pdf from hidden a4 layout"
```
