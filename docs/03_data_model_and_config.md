# 数据模型增量 + Storage 策略 + C1 配置策略（必须落地）

> 原则：MVP 先用“字段/JSON 扛住”，后续再正规化拆表。

---

## 1) Subject 约束（产品锁死数学）
- UI 层：
  - 只显示/只允许创建一个 subject：`math`
  - 其他科目入口全部隐藏/删除
- DB 层：
  - 可以保留原有多 subject 结构（未来扩展用）
  - 但业务逻辑上：创建错题时 subject 固定为 `math`

验收：
- 用户端无法创建/选择非数学 subject
- DB 不会出现多个 subject（或即使存在也不影响产品路径）

---

## 2) ErrorItem（或底座对应实体）字段增量建议（MVP）
> 说明：具体 model 名称/字段名以底座 Prisma schema 为准；以下是“需要承载的信息”。

### 必需字段（MVP）
- `rawImageKey` (string)
  - 原图在 Supabase Storage 的 key
- `cropImageKey` (string)
  - 单题裁剪图在 Storage 的 key
- `structuredJson` (json)
  - LLM 结构化输出（题干/作答/步骤）
- `checkerJson` (json)
  - 校验器输出（checkable/standard_answer/diff/中间量等）
- `diagnosisJson` (json)
  - 错因候选+证据+追问（以及用户确认后的最终错因）

### 可选字段（后续好用，但 MVP 可先不做）
- `difficulty`（int 或 enum）
- `triggers`（json / string[]）典型触发点：通分/移项/配方法/去括号/约分…

### 附件表（可选）
MVP 可以不建 Attachment 表，先把 raw/crop 两张图 key 放在 ErrorItem 上即可。  
后续若需要存更多附件（作答区、导出 PDF、讲解图等）再加：
- `Attachment`：`errorItemId`, `type(raw|crop|answer|pdf|...)`, `storageKey`, `metaJson`

验收：
- 新建错题后：DB 至少能查到 `rawImageKey` / `cropImageKey`
- structured/checker/diagnosis 都能保存/回显

---

## 3) Supabase Storage 访问策略（MVP 推荐做法）
### Bucket
- 创建 bucket：建议 `wrongbook`（或 `attachments`）
- **设为 private**

### Key 组织（建议）
- raw：`raw/<userId>/<uuid>.jpg`
- crop：`crop/<userId>/<uuid>.jpg`

### 上传（必须服务端）
- Next.js API Route / Server Action：
  - 使用 `SUPABASE_SERVICE_ROLE_KEY` 上传（**只在服务端 env**）
  - 上传成功后返回：`{ storageKey }`

### 展示（signed URL）
- 前端展示图片时不直接拼 public URL（因为 bucket private）
- 通过服务端接口生成短期 signed URL（例如 5~30 分钟）
  - `GET /api/images/signed?key=...` -> `{ signedUrl }`
- 前端用 signedUrl 作为 `<img src=...>`

验收：
- bucket 为 private 仍能正常展示图片
- Render redeploy 不影响图片访问（因为图片不在本地）

---

## 4) C1 配置策略：禁止写本地 config 文件（强制）
> 底座可能会把网页设置写到 `config/app-config.json`，但 Render 无持久化磁盘会丢。
> **MVP 必须执行 C1：只从环境变量读取，不落盘。**

### 要求
- **不写本地配置文件**
- 所有配置只从 `.env` / Render env 读取（如 AI Provider、API Key、Model、Base URL）
- 设置页里涉及“保存配置到文件”的入口：
  - **隐藏 / 禁用 / 删除**
- 代码侧如果有 “env < config file” 的优先级逻辑：
  - 需要改成 “只用 env”（或在 production 下直接忽略 config file）

### 建议做一条“防回归检查”
- 启动时若检测到尝试写 `config/app-config.json`：
  - 直接抛错或打印告警（至少在 production 禁止写入）

验收：
- 运行过程中不会产生/修改 `config/app-config.json`
- 修改 env 后 redeploy 即生效
