# Print Preview Separator Strengthening Design

## Goal

让打印预览中题目与题目之间的分隔线更粗、更明显，便于在屏幕预览、浏览器打印预览和导出 PDF 中快速区分每道题。

## Current Problem

当前题块之间的分隔线来自每个题块外层的 `border-b`。默认边框颜色和粗细都较轻，在打印预览和最终打印场景里不够显眼，题块边界容易看不清。

## Decision

采用最小改动方案：

- 保留现有分隔线机制，不新增额外 DOM
- 直接把题块外层分隔线改为更粗的下边框
- 同时加深边框颜色
- 共享渲染统一生效于：
  - 屏幕预览
  - 浏览器打印预览
  - 移动端导出 PDF

## Scope

### In Scope

- `src/app/print-preview/page.tsx`
- 本次设计文档和实现计划

### Out of Scope

- 改动题块内部卡片边框
- 调整题块间距
- 修改 PDF 分页算法

## UX Result

### Before

- 分隔线较细较淡
- 连续多题时边界不够清楚

### After

- 分隔线更粗
- 分隔线颜色更深
- 题与题之间视觉边界更清晰，但不引入额外留白

## Risks

### Risk 1: 分隔线过重

如果颜色过深或线条过粗，页面会显得生硬。

Mitigation:

- 只小幅增强，不做黑色实线
- 仍保持现有的圆角卡片和留白结构

## Test Strategy

- 手工检查屏幕预览中分隔线是否明显增强
- 检查浏览器打印预览和导出 PDF 是否同步增强
- 运行页面 lint，确保没有引入新的 JSX/TS 问题

## Success Criteria

- 每道题之间的分隔线明显比之前更清晰
- 屏幕、打印、PDF 三者一致
- 不增加每道题的额外高度
