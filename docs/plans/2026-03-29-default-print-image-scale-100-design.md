# Default Print Image Scale 100 Design

## Goal

把打印预览中原题图片的默认展示比例，从 `80%` 调整为 `100%`。

## Current Behavior

- 每道题如果已经保存了 `printImageScale`，打印页使用保存值。
- 如果 `printImageScale` 为空，则回退到统一默认值 `80`。

这会让未手动调整过比例的题，在打印页里默认显示得偏小。

## Decision

仅调整 fallback 默认值：

- `printImageScale` 有值：保持原样
- `printImageScale` 为空：默认值从 `80` 改成 `100`

## Scope

### In Scope

- `src/lib/print-image-scale.ts`
- `src/__tests__/unit/print-image-scale.test.ts`
- 本次设计文档和实现计划

### Out of Scope

- 修改已保存到数据库的题目比例
- 修改比例步进、最小值、最大值
- 新增配置项或设置页

## Expected Result

- 新题或旧题中，凡是还没有保存 `printImageScale` 的，原图默认显示 `100%`
- 之前已经手动调过比例的题不受影响
- 屏幕预览、浏览器打印预览、导出 PDF 一起生效

## Risks

### Risk 1: 默认图更大，个别题可能更占空间

Mitigation:

- 这是用户明确想要的默认效果
- 仍可通过现有 `+ / -` 按钮按题单独缩回去

## Test Strategy

- 单测确认 `resolvePrintImageScale(null | undefined | "") === 100`
- 单测确认已有保存值仍优先使用

## Success Criteria

- 未保存比例的题默认按 `100%` 显示
- 已保存比例的题保持原值
