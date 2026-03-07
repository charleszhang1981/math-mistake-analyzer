# 数据模型与配置说明（现状版）

> 更新时间：2026-03-06
> 本文以当前 Prisma schema、API 行为和页面读写路径为准。

## 1. 数据模型概览

当前核心模型包括：

- `User`
- `Subject`
- `KnowledgeTag`
- `ErrorItem`
- `ReviewSchedule`
- `PracticeRecord`

其中真正驱动主业务的是：

- `ErrorItem`
- `KnowledgeTag`
- `ReviewSchedule`
- `structuredJson v2`

## 2. Subject：结构保留，产品锁定

### 2.1 数据库层

`Subject` 仍然是独立表，`ErrorItem.subjectId` 仍指向它。

这说明数据库结构层面 **保留了多错题本 / 多学科扩展能力**。

### 2.2 产品层

当前产品逻辑已经锁定为一个数学错题本：

- 错题本名称规范为 `Math`
- 旧名称如 `数学`、`math` 会被归一或升级到 `Math`
- `GET /api/notebooks` 当前只返回这个数学错题本
- `POST /api/notebooks` 当前拒绝创建新错题本
- `PUT /api/notebooks/[id]` 仅允许保留 `Math`
- `DELETE /api/notebooks/[id]` 当前也不会允许把数学错题本作为正常产品路径删除

结论：

- `Subject` 是 **保留结构**
- `Math` 是 **当前唯一正式产品路径**

## 3. ErrorItem：当前核心业务实体

`ErrorItem` 当前既承担错题主记录，也承担图片引用与结构化分析结果的持久化。

### 3.1 当前主字段

#### 标识与归属

- `id`
- `userId`
- `subjectId`
- `questionNo`

#### 图片相关

- `originalImageUrl`
- `rawImageKey`
- `cropImageKey`
- `ocrText`

说明：

- 当前主链路会至少保存 `originalImageUrl`
- 当走 Storage 路径时，`originalImageUrl` 通常保存为 `storage:<key>` 形式的引用
- 页面展示时优先使用：
  - `cropImageKey`
  - `rawImageKey`
  - 从 `originalImageUrl` 反推的 storage key

#### AI 结果与结构化内容

- `questionText`
- `answerText`
- `analysis`
- `knowledgePoints`
- `structuredJson`
- `checkerJson`
- `diagnosisJson`

#### 用户补充信息

- `source`
- `errorType`
- `userNotes`
- `masteryLevel`
- `gradeSemester`
- `paperLevel`

#### 关系

- `tags: KnowledgeTag[]`
- `reviewSchedules: ReviewSchedule[]`

### 3.2 当前真正被主链路使用的字段

在当前创建、更新、详情、打印、练习链路中，主字段是：

- `originalImageUrl`
- `rawImageKey`
- `cropImageKey`
- `questionNo`
- `questionText`
- `answerText`
- `analysis`
- `structuredJson`
- `tags`
- `gradeSemester`
- `paperLevel`
- `masteryLevel`
- `reviewSchedules`

### 3.3 保留但未进入主链路的字段

#### `checkerJson`

- Prisma schema 中保留
- `src/lib/math-checker.ts` 中已有规则和 schema
- 但当前 `POST /api/error-items` 与 `PUT /api/error-items/[id]` 不写入

#### `diagnosisJson`

- Prisma schema 中保留
- 有相应 schema 和构造函数
- 但当前保存与更新主链路不写入

结论：

- 这两个字段应被视为 **保留字段 / 未启用主流程**
- 当前主数据源不是它们，而是 `structuredJson v2`

## 4. `structuredJson v2`：当前主数据契约

### 4.1 定位

`structuredJson v2` 是当前最重要的业务对象，负责承载：

- 题干结构
- 学生答案与步骤
- 标准解法
- 错误定位
- 根因确认

详情页、编辑页、打印页、练习生成都围绕它工作。

### 4.2 当前结构

```json
{
  "version": "v2",
  "problem": {
    "stage": "primary | junior_high",
    "topic": "string",
    "question_markdown": "string",
    "given": ["string"],
    "ask": "string",
    "fontSizeHint": "small | normal | large"
  },
  "student": {
    "final_answer_markdown": "string",
    "steps": ["string"]
  },
  "knowledge": {
    "tags": [
      {
        "name": "string",
        "evidence": "string",
        "confidence": 0.5
      }
    ]
  },
  "solution": {
    "finalAnswer": "string",
    "steps": ["string"]
  },
  "mistake": {
    "studentSteps": ["string"],
    "studentAnswer": "string | null",
    "wrongStepIndex": 0,
    "whyWrong": "string",
    "fixSuggestion": "string"
  },
  "rootCause": {
    "studentHypothesis": "string",
    "confirmedCause": "string",
    "chatSummary": "string"
  }
}
```

### 4.3 字段职责

#### `problem`

- 题目元信息
- `question_markdown` 是主题干文本
- `fontSizeHint` 主要用于打印和显示布局

#### `student`

- 表示学生最终答案与原始步骤还原

#### `knowledge`

- 当前结构中保留 tags 数组
- 但实际标签系统主落库方式仍是 `KnowledgeTag` 关系与 `knowledgePoints` 兼容字段

#### `solution`

- 对应 G：标准解法

#### `mistake`

- 对应 H：错误定位

#### `rootCause`

- 对应 I：根因自诊断
- 当前正式使用的是 `confirmedCause`
- 根因聊天接口目前未启用，`chatSummary` 仍主要是保留字段

### 4.4 当前读写规则

- 分析接口会返回 `structuredJson`
- 错题创建时若传入结构化内容，会先做 normalize
- 若未传入，会基于 `questionText + answerText + analysis` 自动补构一个基础 `v2`
- 错题更新时也会优先维护 `structuredJson`
- 编辑 G/H/I 时，本质上是在更新 `structuredJson`

## 5. KnowledgeTag：当前标签主落库模型

标签系统当前由 `KnowledgeTag` 表支撑，支持：

- `subject`
- `parentId` / `children`
- `isSystem`
- `userId`
- `code`
- `order`

当前的真实使用方式：

- 系统标签与用户自定义标签共存
- AI 返回知识点后，保存错题时会查找已有标签
- 找不到时允许自动创建用户标签
- `ErrorItem.tags` 是当前主关系
- `knowledgePoints` 字符串字段只作为兼容旧数据的辅助字段保留

## 6. ReviewSchedule：当前复习模型

`ReviewSchedule` 是当前复习主模型：

- `scheduledFor`
- `completedAt`
- `isCorrect`
- `reviewNote`

当前行为：

- 新建错题时会创建一条立即到期的复习记录
- 每次复习提交后：
  - 先完成一条 pending 记录
  - 再新建下一条 schedule
- 固定规则：
  - 正确：`+3` 天
  - 错误：`+1` 天

## 7. PracticeRecord：当前练习统计模型

`PracticeRecord` 当前用于记录练习结果与统计：

- `userId`
- `subject`
- `difficulty`
- `isCorrect`
- `createdAt`

虽然模型字段允许更通用的科目值，但当前主路径仍固定写入数学。

## 8. 当前核心 API 契约

### 8.1 图片相关

### `POST /api/images/upload`

用途：

- 上传原图、裁剪图或其他附件到私有 Storage

请求：

- `multipart/form-data`
- 字段：
  - `file`
  - `kind`：`raw | crop | answer`

响应：

```json
{
  "key": "crop/user-id/uuid.jpg",
  "signedUrl": "https://..."
}
```

### `GET /api/images/signed?key=...`

用途：

- 为已有 storage key 生成 signed URL

特点：

- 需要鉴权
- 会校验 key 是否属于当前用户目录

### 8.2 AI 相关

### `POST /api/analyze`

用途：

- 对裁剪图执行两阶段视觉 LLM 分析

输入核心字段：

- `imageBase64`
- `mimeType`
- `language`
- `subjectId`

返回核心字段：

- `questionText`
- `answerText`
- `analysis`
- `knowledgePoints`
- `structuredJson`

### `POST /api/reanswer`

用途：

- 基于题干重新生成答案、解析与 G/H 结构

输入核心字段：

- `questionText`
- `language`
- `subject`
- `imageBase64`（可选）

### 8.3 错题相关

### `POST /api/error-items`

用途：

- 创建错题

当前主写入内容：

- 图片引用
- 题干、答案、解析
- `structuredJson`
- 标签关系
- `gradeSemester`
- `paperLevel`
- 初始复习记录

当前不应期待该接口写入：

- `checkerJson`
- `diagnosisJson`

### `PUT /api/error-items/[id]`

用途：

- 更新错题的结构化内容、标签、元数据等

当前主更新内容：

- `questionText`
- `answerText`
- `analysis`
- `rawImageKey`
- `cropImageKey`
- `structuredJson`
- `knowledgePoints` / `tags`
- `gradeSemester`
- `paperLevel`

### `GET /api/error-items/[id]`

用途：

- 获取错题详情

可选能力：

- `includeSignedImage=1` 时返回已签名图片地址

### 8.4 复习相关

### `GET /api/review/list`

用途：

- 获取复习队列

当前特点：

- 支持 `dueOnly`
- 返回 `tags`
- `cause` 当前固定为 `"Uncategorized"`

### `POST /api/review/record`

用途：

- 提交一次复习结果并生成下一次 schedule

输入核心字段：

- `errorItemId`
- `isCorrect`
- `reviewNote`

### 8.5 练习相关

### `POST /api/practice/generate`

用途：

- 根据已有错题生成练习题

上下文来源：

- `questionText`
- 关联标签
- `structuredJson.mistake.whyWrong`
- `structuredJson.rootCause.confirmedCause`
- `gradeSemester`

## 9. 配置说明

### 9.1 当前配置来源

当前运行配置只来自环境变量，不从本地 JSON 文件读取持久化配置。

关键环境变量包括：

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `NEXTAUTH_SECRET`
- `AUTH_TRUST_HOST`
- `AI_PROVIDER`
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT`

### 9.2 `/api/settings`

#### `GET /api/settings`

- 返回当前 env 解析出来的配置对象
- 用于设置页展示与测试

#### `POST /api/settings`

- 当前不执行持久化更新
- 直接返回：

```json
{
  "message": "CONFIG_ENV_ONLY"
}
```

### 9.3 当前明确结论

- 当前没有“网页修改配置后写入本地文件”的正式能力
- `config/app-config.json` 不应再被视为当前架构的一部分
- 运行时配置变化应通过修改 env 并重启/重部署生效
