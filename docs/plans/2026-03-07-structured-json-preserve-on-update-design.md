# Structured JSON Preserve-on-Update Design

## Goal

修复错题详情页的局部更新请求，确保在没有显式提交 `structuredJson` 时，不会因为后端 fallback 重建而把已有的 G/H/I 覆盖成摘要版或清空。

## Current Problem

- 详情页的标签、题干、年级/试卷等级等编辑请求通常不会带 `structuredJson`。
- `PUT /api/error-items/[id]` 在 `structuredJson` 缺失时，会调用 `buildStructuredQuestionJson(...)` 重建整份结构化数据。
- 一旦请求体里只有 `questionText / answerText / analysis`，G/H 会退化成 `analysis` 摘要，I 也会被清空。

## Decision

采用“保留已有 structuredJson，只对显式字段局部 merge”的方案：

1. 如果请求显式传了合法 `structuredJson`，仍按它保存。
2. 如果请求没有传 `structuredJson`，但数据库里已有合法 `structuredJson`：
   - 默认保留原值；
   - 只有在请求里显式传了会影响结构化数据的字段时，才对现有数据做局部 merge。
3. 只有当数据库里本来就没有合法 `structuredJson` 时，才允许 fallback 到 `buildStructuredQuestionJson(...)`。

## Scope of Merge

- `questionText`：同步到 `problem.question_markdown / ask / stage / topic`
- `answerText`：同步到 `student.final_answer_markdown`
- `solutionFinalAnswer`：同步到 `solution.finalAnswer`
- `solutionSteps`：同步到 `solution.steps`
- `mistakeStudentSteps`：同步到 `mistake.studentSteps`
- `mistakeWrongStepIndex`：同步到 `mistake.wrongStepIndex`
- `mistakeWhyWrong`：同步到 `mistake.whyWrong`
- `mistakeFixSuggestion`：同步到 `mistake.fixSuggestion`

不应影响：

- `rootCause.confirmedCause`
- 现有的 G/H 未修改部分
- 仅标签、年级、试卷等级更新时的整份结构化数据

## Additional UX Fix

- 标签建议请求失败时不再 `console.error` 触发开发 overlay，只静默降级为“无建议”。
- 标签保存按钮在请求中禁用，避免重复点击造成多次成功提示。
