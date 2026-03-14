# Mobile PDF Export Anti-Clipping Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 通过放松隐藏导出容器的排版，修复手机端 PDF 中单行文字和字段内容被裁切的问题，同时保持桌面打印与屏幕预览不变。

**Architecture:** 继续使用现有隐藏 A4 导出容器与手机端 html2canvas 截图链路，只针对导出容器添加更安全的行高、段落和内联字段样式；必要时给导出布局添加专用类名，避免影响屏幕预览。

**Tech Stack:** Next.js App Router、React、TypeScript、Tailwind CSS、html2canvas、jsPDF、Vitest、ESLint

---

### Task 1: 补充设计文档与实施计划

**Files:**
- Create: `docs/plans/2026-03-14-mobile-pdf-export-anti-clipping-design.md`
- Create: `docs/plans/2026-03-14-mobile-pdf-export-anti-clipping-implementation-plan.md`

**Step 1: 写设计文档**

记录症状、判断、方案对比与只改导出容器的决策。

**Step 2: 写实施计划**

把实现拆成样式调整、必要的布局 class 调整、验证三部分。

### Task 2: 调整隐藏导出容器的字段布局与行高

**Files:**
- Modify: `src/app/print-preview/page.tsx`
- Modify: `src/components/markdown-renderer.tsx`（仅在确有必要时）

**Step 1: 给导出容器增加更安全的专用样式**

- 提高 `.pdf-export-sheet` 的 `line-height`
- 放松 `.pdf-export-sheet .inline-field`
- 放松 `.pdf-export-sheet .markdown-content p`

**Step 2: 为导出容器里的内联字段加专用 class 或样式分支**

确保 `标准答案`、`错误定位`、`根因` 这些单行区域不再因为 `display:inline` 被裁掉。

**Step 3: 如果必要，再调整 Markdown 渲染**

只对导出容器场景做最小修复，不影响全站其它页面。

### Task 3: 检查是否需要收紧无效改动

**Files:**
- Modify: `src/app/print-preview/page.tsx`
- Modify: `src/lib/print-pdf.ts`

**Step 1: 评估块分页逻辑是否继续保留**

如果确认它对当前问题无帮助但也不产生副作用，则保留；若引入额外不确定性，则收紧到最小必要状态。

**Step 2: 保持导出行为稳定**

确保移动端仍然导出隐藏 A4 容器，桌面端仍然走 `window.print()`。

### Task 4: 运行测试与静态检查

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

- 手机导出此前有问题的题目
- 确认“标准答案”“错误定位”“根因”不再被裁切
- 确认页数没有大幅回退
