# Single Notebook Route Cleanup Design

## Goal

在单错题本模式下，移除遗留的“错题本列表页”心智，让 `/notebooks` 不再展示列表，而是直接进入唯一的 `Math` 错题详情页。

## Current Problem

- 打印预览页左上返回箭头仍然跳到 `/notebooks`。
- `/notebooks` 仍然渲染旧的多错题本列表页。
- API 已经锁定只返回一个 `Math` 错题本，但前端路由还保留多本时代的页面结构。

## Decision

采用“路由收口”方案，而不是逐页替换所有旧链接：

1. `/notebooks` 改成纯跳转页，加载后自动跳到唯一错题本详情页 `/notebooks/[id]`。
2. 打印预览页返回箭头优先回当前 `subjectId` 对应的详情页；无 `subjectId` 时退回 `/notebooks`，再由重定向页兜底。
3. 现有代码里残留的 `router.push("/notebooks")` 暂时保留，因为它们会被新的 `/notebooks` 跳转页自动收口，不再暴露旧列表 UI。

## Why This Approach

- 改动范围小，不需要满仓库替换旧链接。
- 兼容现有入口，避免遗漏某个老按钮或异常兜底路径。
- 用户不会再看到图 1 的旧列表页，产品心智与当前单本模式保持一致。

## Verification

- 直接打开 `/notebooks`，应自动进入 `Math` 错题详情页。
- 从打印预览页点击返回箭头，应回到当前错题详情页，而不是旧列表页。
- 旧的 `router.push("/notebooks")` 兜底场景不应再露出列表页。
