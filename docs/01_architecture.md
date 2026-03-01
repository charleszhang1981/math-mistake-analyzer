# 架构与模块边界（实现导向）

## 逻辑组件
[PC Browser UI]
  - 上传/截图/单题裁剪
  - 错因确认与追问
  - 复习与练习

        |
        v

[Next.js App (fork wrong-notebook)]
  - NextAuth（登录/用户）
  - 错题 CRUD / 列表 / 标签 / 导出（继承底座能力）
  - 与 Supabase（DB/Storage）交互
  - 调用（可选）OCR / Checker / LLM

        |                      |                       |
        v                      v                       v

[OCR Service (optional)]   [Checker Service]         [LLM Provider]
 Pix2Text                   SymPy/Math-Verify         OpenAI/Gemini/...
 - image->md/latex          - 标准答案/判等           - 结构化schema
                            - 关键中间量              - 错因候选+证据+追问
                            - gating 可校验性         - 出题（草稿）

        |
        v

[Supabase]
- Postgres（Prisma）
- Storage（raw/crop/answer 等附件）

---

## 数据流（MVP）
### Step 1 输入与存储
1) 用户上传图片得到 `raw_image`
2) 进入裁剪界面，用户调整得到 `crop_image`
3) 上传到 Supabase Storage：
   - raw：`raw/<user>/<uuid>.jpg`
   - crop：`crop/<user>/<uuid>.jpg`
4) DB 记录 storage key（不存本地路径）

### Step 2 纠错（先跑通最小链路）
- MVP可选两条路径（建议先做 A）：
A) 直接走“视觉 LLM”做结构化（无需 OCR 服务）
B) OCR（Pix2Text）→ LLM 结构化（更稳、更便宜但工程更重）

### Step 3 校验器与错因
- LLM 输出结构化 schema
- Checker 对 **可计算题型** 计算标准答案/判等
- LLM 结合 checker 输出：
  - 错因候选（多条）
  - 证据（引用题干/作答片段或 checker diff）
  - 追问（用于确认/补全推导缺口）
- 用户确认错因 → 写入 DB

---

## LLM 结构化 Schema（建议）
（存 JSON 即可，MVP先别拆太多表）

```json
{
  "problem": {
    "stage": "primary|junior_high",
    "topic": "fraction|equation|ratio|geometry|...",
    "question_markdown": "...",
    "given": ["..."],
    "ask": "..."
  },
  "student": {
    "final_answer_markdown": "...",
    "steps": ["...", "..."]
  },
  "check": {
    "checkable": true,
    "standard_answer": "...",
    "key_intermediates": [{"name":"...", "value":"..."}],
    "diff": "..."
  },
  "diagnosis": {
    "candidates": [
      {
        "cause": "通分错误/移项漏变号/...",
        "trigger": "通分|移项|配方法|...",
        "evidence": "...",
        "questions_to_ask": ["你这一步为什么把...写成...？", "..."]
      }
    ]
  }
}
```

---

## 数据模型改造建议（在底座 Prisma 上最小增量）
> 原则：MVP先“字段/JSON 扛住”，后面再正规化拆表。

### 1) Subject 约束
- UI 层只显示/允许创建一个 subject：`math`
- DB 可保留多 subject 结构（将来扩展用），但产品上锁死为数学

### 2) ErrorItem（或底座相应实体）新增字段建议
- `rawImageKey`（string）
- `cropImageKey`（string）
- `structuredJson`（json）
- `checkerJson`（json）
- `diagnosisJson`（json）
- `difficulty`（int/enum，可选）
- `triggers`（json/string[]，可选）

### 3) Supabase Storage 访问策略
- bucket 设为 private
- Next.js 服务端：
  - 上传用 `service_role`（只在服务端 env）
  - 展示用 signed URL（短期有效）

---

## C1 配置策略：必须执行
底座可能会把网页设置写到 `config/app-config.json`（在 Render 上会丢）。
MVP 要求：
- **不写本地配置文件**
- 配置只从环境变量读取
- 设置页中涉及写入本地 config 的入口：**隐藏/禁用/删除**
