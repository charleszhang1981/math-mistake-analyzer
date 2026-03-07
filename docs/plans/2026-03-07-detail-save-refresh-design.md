# Detail Save Refresh Design

## Goal

修复错题详情页里“部分编辑按钮保存后，本地 `item` 状态仍是旧值”的残留风险，避免后续再编辑 G/H/I 时把刚更新过的题干或 metadata 写回旧值。

## Current Problem

- `saveQuestionHandler` 之前只更新 `item.questionText`，不会同步本地 `structuredJson.problem.question_markdown`。
- `saveMetadataHandler` 会触发 `fetchItem(...)`，但没有 `await`，本地状态更新和成功提示顺序不稳定。
- 后端已经修好“metadata/tag 不应重建 `structuredJson`”，但前端如果继续拿旧的本地 `item.structuredJson` 做下一次 G/H/I 保存，仍然可能把题干字段回滚。

## Chosen Approach

保存题干和 metadata 后，先把本地 `item` 同步到与后端一致的最小状态，再统一 `await fetchItem(item.id)` 回拉最新整条详情数据。保存按钮在请求期间禁用，避免重复提交和刷新前竞态。

## Why This Approach

- 复用现有详情查询接口，不引入新的 API 契约。
- 让前端本地状态与数据库保持单一事实来源，避免局部 `setItem(...)` 漏同步嵌套字段。
- 只动详情页，风险最小。
