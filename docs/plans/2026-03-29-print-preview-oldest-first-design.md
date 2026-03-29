# Print Preview Oldest-First Ordering Design

## Goal

让打印链路中的题目顺序改为“旧题在上，新题在下”，同时保持错题本列表页继续使用“新题在上”。

## Current Problem

当前打印预览页直接复用 `/api/error-items/list`，而该接口默认按 `createdAt desc` 返回数据。因此：

- 错题本列表页排序正确，仍然是最新题目在上
- 打印预览、浏览器打印预览、导出 PDF 也被动继承了同样的倒序
- 这与打印场景下“按更自然的累积学习顺序打印旧题到新题”的需求不一致

## Approaches Considered

### Approach 1: 仅在打印链路增加显式排序参数

- 保持 `/api/error-items/list` 默认行为不变
- 为该接口增加可选排序参数
- 打印预览页显式请求 `createdAt` 正序

Pros:

- 改动最小
- 不影响错题本列表和其他使用该接口的页面
- 打印预览、浏览器打印、导出 PDF 会天然保持一致

Cons:

- 接口多了一个可选参数，需要补最小验证

### Approach 2: 直接修改列表接口默认排序

- 把 `/api/error-items/list` 默认从 `createdAt desc` 改成 `createdAt asc`

Pros:

- 代码最少

Cons:

- 会破坏错题本页面当前“新题在上”的既有行为
- 风险明显过大

### Approach 3: 打印页前端拿到数据后再本地反转

- 继续请求默认倒序
- 打印页本地将数组反转

Pros:

- 不改接口

Cons:

- 语义不清晰
- 与分页逻辑耦合，后续容易出问题
- 不如显式排序参数干净

## Decision

采用 Approach 1。

具体方案：

- `/api/error-items/list` 新增可选排序参数
- 默认仍为 `createdAt desc`
- 打印预览页请求时显式带上 `sort=createdAtAsc`
- 错题本列表页和其他调用方不做改动

## Scope

### In Scope

- `src/app/api/error-items/list/route.ts`
- `src/app/print-preview/page.tsx`
- 必要的验证与文档

### Out of Scope

- 错题本列表页排序逻辑
- 详情页、复习页、练习页排序逻辑
- 打印页布局、分页、样式调整

## Data Flow

1. 打印预览页读取当前筛选参数
2. 在请求 `/api/error-items/list` 时附加 `sort=createdAtAsc`
3. 列表接口解析该参数并生成对应 `orderBy`
4. 返回按创建时间正序排列的数据
5. 打印预览、浏览器打印和导出 PDF 使用同一批 `items`，因此展示顺序一致

## Risks

### Risk 1: 影响非打印调用方

Mitigation:

- 默认排序继续保留 `createdAt desc`
- 只有打印页才显式传新参数

### Risk 2: 参数值拼写或非法值导致不可预期排序

Mitigation:

- 接口只接受已知值
- 非法或缺省时回退到当前默认倒序

## Test Strategy

- 确认打印预览页请求包含 `sort=createdAtAsc`
- 确认列表接口在缺省情况下仍按 `createdAt desc`
- 确认显式传参时按 `createdAt asc`
- 运行相关文件的 lint，必要时补充或更新针对性测试

## Success Criteria

- 打印预览页面显示为旧题在上
- 浏览器打印预览与导出 PDF 顺序一致
- 错题本列表页继续保持新题在上
- 未引入新的接口错误或排序回归
