# Codex 任务清单（按优先级）

## Milestone 0：Fork & Baseline
- [ ] fork `wttwins/wrong-notebook`
- [ ] 本地跑通（按 README）
- [ ] 识别关键点：
  - Prisma schema / migrations
  - 图片上传与存储逻辑
  - AI 调用入口
  - “设置页/配置持久化”相关代码位置（重点关注 `config/app-config.json`）

验收：
- 本地能登录、能新增/编辑错题（即使先不接 OCR/AI）

---

## Milestone 1：Supabase 一步到位（关键）
### 1.1 Prisma 切 Postgres（Supabase）
- [ ] `provider: sqlite` → `postgresql`
- [ ] 环境变量 `DATABASE_URL` 指向 Supabase
- [ ] 迁移并验证 CRUD 正常

### 1.2 Storage：图片/附件全上 Supabase Storage
- [ ] 创建 bucket（private）
- [ ] 实现 API：
  - `POST /api/images/upload`：上传 raw/crop，返回 `{key, signedUrl}`
  - `GET /api/images/signed?key=...`：返回 signedUrl（可选）
- [ ] DB 存 `rawImageKey/cropImageKey`（不存本地路径）

### 1.3 C1：禁用本地 config 持久化
- [ ] 禁用/移除写 `config/app-config.json` 的逻辑
- [ ] 只从 env 读取：AI provider key / model / base url（如有）
- [ ] 隐藏设置页中“在线修改并写文件”的入口（若存在）

验收：
- Render 上 redeploy 不丢数据、不丢图片、不依赖磁盘

---

## Milestone 2：Step 1 单题裁剪（PC-first）
- [ ] 上传后进入裁剪页（或弹窗）
- [ ] 使用 `react-image-crop` 实现：
  - 默认裁剪框（全图/居中大框）
  - 拖拽调整
  - Confirm 后生成裁剪图片（canvas 导出 blob）
- [ ] 上传裁剪图片到 Storage，写入 `cropImageKey`

验收：
- 从整页试卷图，用户 10 秒内裁出“这一道题（含作答过程）”并入库

---

## Milestone 3：纠错链路（先跑通最小闭环）
> MVP建议先用“视觉 LLM”直接做结构化，减少 OCR 工程量。OCR 可后置。

- [ ] 定义并固化 LLM 输出 schema（见 `01_architecture.md`）
- [ ] 从 `cropImageKey` 取 signedUrl（或直接传 image bytes）给 LLM
- [ ] 存 `structuredJson`（题干/学生答案/步骤）

验收：
- 能从裁剪图得到可用的结构化结果（哪怕不完美）

---

## Milestone 4：Checker + 错因（可计算题型优先）
- [ ] 引入 `Math-Verify` 思路（可做成独立 Python service 或 Node/Python 混合方案）
- [ ] 先覆盖：
  - 分数运算
  - 一元一次方程
  - 简单比例/代数
- [ ] 输出 `checkerJson`（含 checkable/standard_answer/diff/中间量等）
- [ ] LLM 基于 checker 生成 `diagnosisJson`（错因候选+证据+追问）
- [ ] UI：用户确认/编辑错因后保存

验收：
- 对“可计算题型”能稳定判对错，并给出可读的错因候选

---

## Milestone 5：复习（先简单规则，后 FSRS）
- [ ] 按错因/知识点聚类列表
- [ ] 复习记录：对/错/备注
- [ ] 简单间隔规则（MVP）：
  - 错→+1天；对→+3天（示例）
- [ ] （升级项）接入 FSRS：保存 fsrs state，自动算下次复习时间

---

## Milestone 6：出题 + gating（后续）
- [ ] LLM 从错因/知识点生成新题（草稿）
- [ ] Checker 验证“答案可算且一致”
- [ ] gating：只有可校验且通过的题才展示

---

# 环境变量建议（Render/Supabase）
- `DATABASE_URL`（Supabase Postgres）
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`（前端可用）
- `SUPABASE_SERVICE_ROLE_KEY`（仅服务端）
- `NEXTAUTH_SECRET`
- `AUTH_TRUST_HOST=true`
- `NEXTAUTH_URL`（可选）
- `AI_PROVIDER` / `OPENAI_API_KEY` / `GEMINI_API_KEY` 等（按底座实现）

# 备注
- MVP阶段只有 1 个用户也没关系：保留 auth 是为了未来扩展
- 不做多题自动切分：靠单题裁剪+手动调整保证“可用性”
