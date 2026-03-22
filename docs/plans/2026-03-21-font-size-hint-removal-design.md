# Font Size Hint Removal Design

## Goal

停止 AI 与前端对 `fontSizeHint` 的生产和消费，让打印预览里的原题展示比例完全由 `printImageScale` 控制。

## Current Problem

- AI 第一阶段提取 prompt 会要求输出 `question_font_size_hint`。
- 三个 provider 会解析 `small | normal | large`，并把它并入 `ParsedQuestion`。
- `structuredJson` 的 `problem.fontSizeHint` 会被构建、merge、保存。
- 打印预览页在 `printImageScale` 为空时，还会回退到 `fontSizeHint -> 60 / 80 / 90`。

这导致系统同时存在两套控制原图展示比例的机制：

1. AI 猜字号
2. 用户手动调比例

用户已经明确决定保留第二套，删除第一套。

## Decision

采用“停用但兼容旧数据”的方案：

- AI 不再生成 `question_font_size_hint`
- provider/schema 不再解析或暴露 `fontSizeHint`
- `structuredJson` 不再生成或 merge `problem.fontSizeHint`
- 打印页不再读取 `fontSizeHint`
- 旧数据中即使残留 `fontSizeHint`，也只做宽容解析，不再参与任何显示逻辑

## Scope

### In Scope

- `src/lib/ai/prompts.ts`
- `src/lib/ai/schema.ts`
- `src/lib/ai/openai-provider.ts`
- `src/lib/ai/gemini-provider.ts`
- `src/lib/ai/azure-provider.ts`
- `src/lib/ai/structured-json.ts`
- `src/lib/print-image-scale.ts`
- `src/app/print-preview/page.tsx`
- 受影响测试
- 已对齐文档中关于 `fontSizeHint` 的说明

### Out of Scope

- 删除数据库字段 `printImageScale`
- 数据库迁移
- 清理历史 `structuredJson` 中已经写入的 `fontSizeHint`
- 新增其它自动判图尺寸策略

## Data / Behavior Changes

### AI Analyze / Reanswer

- Analyze 第一阶段输出不再包含 `question_font_size_hint`
- `ParsedQuestion`、`ImageExtractResult` 不再包含 `fontSizeHint`
- provider 的合并结果不再向外返回 `fontSizeHint`

### Structured JSON

- 新生成的 `structuredJson.problem` 不再写入 `fontSizeHint`
- merge 过程中也不再保留或回填该字段
- normalize 需要继续接受旧 payload，但输出时去掉该字段

### Print Preview

- 原图宽度规则改为：
  - 有 `printImageScale`：使用保存值
  - 没有 `printImageScale`：使用统一默认值 `80`
- `small / normal / large` 不再影响打印页、打印预览、导出 PDF

## Risks

### Risk 1: 旧题默认宽度变化

之前未手动调整过的题，可能从 `60 / 80 / 90` 收敛到统一 `80`。

Mitigation:

- 这正是目标行为
- 用户仍可通过现有 `+ / -` 按钮按题单独调整并持久化

### Risk 2: 旧数据 normalize 失败

如果直接严格删除 `fontSizeHint`，旧 `structuredJson` 可能在 normalize 时表现异常。

Mitigation:

- 继续使用 Zod 的宽容对象解析
- 测试覆盖“旧 payload 带 `fontSizeHint` 仍可 normalize”

## Test Strategy

- 单元测试：
  - analyze prompt 不再包含 `question_font_size_hint`
  - `safeParseImageExtract` / `safeParseParsedQuestion` 不再要求 `fontSizeHint`
  - `buildStructuredQuestionJson` / `mergeStructuredQuestionJson` 输出不再带 `problem.fontSizeHint`
  - `normalizeStructuredQuestionJson` 对含旧字段的 payload 仍能成功并在输出里去掉它
  - `resolvePrintImageScale` 在无持久化值时固定返回 `80`
- 页面/行为回归：
  - 打印页仍可用 `+ / -` 调整比例
  - 调整后的比例仍能写回并影响打印 / PDF 导出

## Success Criteria

- 新解析题目和重答题链路里不再出现 `fontSizeHint`
- 打印页不再读取 `fontSizeHint`
- 原题展示比例只有一套来源：`printImageScale`
- 旧数据页面可正常打开，打印页可正常渲染
