# 架构与主流程（现状版）

> 更新时间：2026-03-06
> 本文描述当前仓库已经实现的系统边界与数据流，不再记录已被代码推翻的早期方案。

## 1. 系统边界

当前系统可分为 6 个核心部分：

1. **前端页面层**
   - 首页 `/`
   - 错题本页 `/notebooks`
   - 新增错题页 `/notebooks/[id]/add`
   - 错题详情页 `/error-items/[id]`
   - 复习页 `/review`
   - 练习页 `/practice`
   - 打印预览页 `/print-preview`
   - 统计页 `/stats`

2. **业务 API 层**
   - 图片上传/签名
   - AI 分析与重答
   - 错题 CRUD
   - 复习记录
   - 练习生成
   - 标签与统计

3. **AI Provider 适配层**
   - Gemini
   - OpenAI
   - Azure OpenAI

4. **数据库层**
   - Prisma + PostgreSQL（当前以 Supabase Postgres 为目标部署方式）

5. **对象存储层**
   - Supabase Storage
   - 私有 bucket + signed URL

6. **认证与后台能力**
   - NextAuth 登录
   - 用户管理
   - 管理员操作

## 2. 当前主链路

### 2.1 双入口上传

当前有两个上传入口，但走的是同一条业务路径：

- 首页 `/`
- 指定错题本页 `/notebooks/[id]/add`

两者共享以下流程：

1. 选择图片、拍照或截图
2. 调用 `POST /api/images/upload` 上传原图，`kind=raw`
3. 打开裁剪弹窗 `ImageCropper`
4. 生成裁剪图后再次上传，`kind=crop`
5. 将裁剪图压缩成 base64
6. 调用 `POST /api/analyze`
7. 进入 `CorrectionEditor`
8. 人工确认后调用 `POST /api/error-items`

### 2.2 图片存储链路

图片不落本地磁盘，统一走 Supabase Storage：

- 原图 key：`raw/<userId>/<uuid>.<ext>`
- 裁剪图 key：`crop/<userId>/<uuid>.<ext>`
- 其他预留附件：`answer/...`

显示时不直接暴露 public URL，而是通过服务端生成 signed URL。

## 3. AI 分析架构

### 3.1 不是 OCR 服务架构

当前主链路不是 “OCR -> checker -> diagnosis”。

当前主链路是 **两阶段视觉 LLM**：

1. **Stage 1 Extract**
   - 输入：裁剪后的题图
   - 目标：提取题干、字体大小提示、学生步骤原始文本
   - 主要输出字段：
     - `questionText`
     - `requiresImage`
     - `fontSizeHint`
     - `studentStepsRaw`

2. **Stage 2 Reason**
   - 输入：Stage 1 的提取结果 + 数学标签候选
   - 目标：生成答案、解析、知识点，以及 G/H 结构化内容
   - 主要输出字段：
     - `answerText`
     - `analysis`
     - `knowledgePoints`
     - `solutionFinalAnswer`
     - `solutionSteps`
     - `mistakeStudentSteps`
     - `mistakeWrongStepIndex`
     - `mistakeWhyWrong`
     - `mistakeFixSuggestion`

### 3.2 Provider 适配层

当前支持 3 个 provider，调用方式统一封装在 `src/lib/ai/`：

- Gemini
- OpenAI
- Azure OpenAI

共同点：

- 都实现 `analyzeImage`
- 都实现 `generateSimilarQuestion`
- 都实现 `reanswerQuestion`
- 都读取 env-only 配置

## 4. 主数据结构：`structuredJson v2`

当前业务主数据不是 `checkerJson` 或 `diagnosisJson`，而是 `structuredJson v2`。

它在以下位置被持续使用：

- 分析结果返回
- 错题保存
- 错题更新
- 详情页展示
- 编辑页回填
- 打印页 G/H/I 展示
- 练习生成上下文

### 4.1 G/H/I 的页面映射

- **G 标准解法**
  - `solution.finalAnswer`
  - `solution.steps`

- **H 错误定位**
  - `mistake.studentSteps`
  - `mistake.wrongStepIndex`
  - `mistake.whyWrong`
  - `mistake.fixSuggestion`

- **I 根因自诊断**
  - `rootCause.confirmedCause`

## 5. 配置架构

### 5.1 env-only

当前运行时配置只来自环境变量，例如：

- `AI_PROVIDER`
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY`
- `AZURE_OPENAI_API_KEY`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 5.2 设置页的真实角色

设置页当前是“查看 + 测试 + 管理”的组合页，而不是“落盘配置编辑器”：

- 可以读取当前配置展示给已登录用户
- 可以测试 AI 连接
- 可以进行用户管理、数据清理、标签迁移等后台操作
- **不能** 持久化修改 AI 配置

## 6. 复习与练习架构

### 6.1 复习

复习由 `ReviewSchedule` 驱动，当前是固定规则：

- 答对：下次复习 `+3` 天
- 答错：下次复习 `+1` 天

当前复习列表页面的分组依据是 **tag**，不是 cause。
API 返回里的 `cause` 目前固定为 `"Uncategorized"`。

### 6.2 练习

练习生成基于以下上下文：

- 原题 `questionText`
- 错题关联标签
- `structuredJson.mistake.whyWrong`
- `structuredJson.rootCause.confirmedCause`
- `gradeSemester`

生成后的题目再通过 `/api/reanswer` 获取标准答案和解析。

## 7. 当前明确不属于主流程的内容

以下内容虽然在代码中存在部分痕迹，但当前不应被写成正式架构能力：

- 根因聊天接口
  - `/api/root-cause-chat`
  - `/api/error-items/[id]/root-cause-chat`
  - 当前都返回 `410`

- `checkerJson` / `diagnosisJson`
  - schema 和规则函数仍在
  - 当前保存与更新主链路不写入
  - 当前详情页与主编辑流程也不依赖它们

- OCR 独立服务
  - 当前没有纳入主链路
