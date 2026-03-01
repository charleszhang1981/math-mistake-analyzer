# AI错题本（数学·小学/初中）Codex Brief

> 固化决策：**C1（只用环境变量，不写本地 config 文件） + 单题裁剪（PC-first）**
> 底座：fork `wttwins/wrong-notebook`（MIT）https://github.com/wttwins/wrong-notebook

## 目标（5大功能）
1. 输入：拍照/截图/上传 → **单题裁剪**（用户可拖拽调整方框）→ 形成题目图片
2. 纠错：LLM 结构化题目与作答 → 校验器算标准答案/关键中间量 → LLM 输出「错因候选+证据+追问」
3. 沉淀：原题（以个人使用存储为主）、错答、错因、知识点、难度、典型触发点（通分/移项/配方法…）
4. 复习：按错因/知识点聚类 + 间隔复习
5. 出题：错因→出题→置信度检测（可校验/高置信才展示）

## 范围（MVP）
- 学科：**仅数学**
- 学段：小学/初中
- 终端：**PC-first**
- 用户：MVP阶段仅 1 名用户（孩子）使用，但保留账号体系便于未来扩展

## 核心技术决策
- App 底座：`wttwins/wrong-notebook`（Next.js + NextAuth + Prisma）
- DB：**Supabase Postgres**（Prisma 连接）
- 图片/附件：**Supabase Storage**
- 部署：Render（**不依赖 Persistent Disk**）
- 配置策略：**C1：禁用/隐藏 UI 配置写入**，只从 `.env` / Render env 读配置（避免 `config/app-config.json` 持久化问题）
- OCR/公式识别：独立服务（MVP可先不接；接的话优先 Pix2Text）
- 校验器：SymPy + Math-Verify（先覆盖可计算题型）

## MVP 交互（Step 1：单题裁剪）
- 用户上传一张整页/半页照片或截图
- 进入裁剪界面：默认裁剪框=整张图（或居中大框）
- 用户拖拽调整框 → “确认”
- 系统生成裁剪图并上传 Storage
- 进入“AI 分析/错因确认/入库”

> 多题自动切分（整页自动拆成第1题/第2题…）不做在 MVP，避免 Step1 过重。

## 推荐开源组件（最小集合）
- 单题裁剪 UI：`react-image-crop`（ISC）https://github.com/DominicTobias/react-image-crop
- OCR/公式（可选）：`Pix2Text`（MIT）https://github.com/breezedeus/Pix2Text
- 校验器：`Math-Verify`（Apache-2.0）https://github.com/huggingface/Math-Verify
- CAS：`SymPy`（BSD）https://github.com/sympy/sympy
- 复习算法（升级项）：`FSRS`（MIT）https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler
- 公式渲染（可选）：`KaTeX`（MIT）https://github.com/KaTeX/KaTeX

## 明确非目标（先不做）
- 高中数学
- 几何证明/作图自动判定（先不碰）
- “整页多题100%自动切题”的极致准确率（用手动裁剪兜底）
