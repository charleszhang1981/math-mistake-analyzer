# Reanswer H Preservation Design

## Goal

修复“重新解题”后 H 被降级成空占位或泛化诊断的问题，确保这条链路真正按“重答题”语义生成 G/H，并避免一次异常结果覆盖已有的可用 H。

## Root Cause

- 三个 AI provider 的 `reanswerQuestion(...)` 当前错误地调用了 `generateReasonPrompt(...)`。
- 同时它们还把 `prompts.analyze` 误作为 custom template 传给了这条链路。
- 因此“重新解题”实际跑的是“诊断/分析”提示词，而不是专门的 `DEFAULT_REANSWER_TEMPLATE`。
- 当前前端在收到空 H 或占位 H 时会直接覆盖原来的 H，导致一次返回异常就把已有内容冲掉。

## Chosen Fix

1. provider 侧全部改为调用 `generateReanswerPrompt(...)`。
2. 强化 `DEFAULT_REANSWER_TEMPLATE`：
   - 若图片中可见学生作答，优先恢复学生的逐步错解。
   - 不允许输出 `(无)`、`none`、`N/A`、`无学生步骤供分析` 这类占位内容。
   - 若步骤部分不完整，也要给出最可能的错误计算路径，而不是留空。
3. 前端 `CorrectionEditor` 在 reanswer 后做一次 H merge：
   - 如果新 H 有意义，使用新 H。
   - 如果新 H 为空或仅为占位，且旧 H 有意义，则保留旧 H，避免降级覆盖。

## Why This Approach

- 先修正 AI prompt 路由，解决根因。
- 再加前端保护，防止模型偶发异常时继续污染已有数据。
- 不改变保存接口和结构化 JSON 契约，改动范围可控。
