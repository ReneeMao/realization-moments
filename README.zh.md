# Realization Moments（领悟时刻）

一个为身处文化夹缝、移民或离散身份的青年成年人设计的、有结构的非临床反思工具。
每次会话会引导一个人走过五个阶段，最后留下一份小小的"陶器"作为产物 —— 一个
他们可以保留、修改、或随时放下的物件。

这是一个研究性原型，不是治疗产品。它建立在叙事身份、叙事疗法、批判意识、
动机式访谈、移民身份发展、AI 中介自我反思以及分层情绪反思的已发表研究之上。
它不进行诊断、不实施治疗，也不替代真正的人类支持。

> 🌐 [English version → README.md](README.md)

---

## 它做什么

一个引导式的五阶段流程：

1. **入口卡片** —— 从六张起始卡片中挑一张（一个反复想起的时刻、一个最近注意到的
   规律、最近感觉有些不同的事、某人说过的一句话、内心两个想要不同东西的部分、
   或此刻的一个想法/感受/身体感觉）。
2. **反思性回望** —— 模型用这个人**自己的话**回应他们说了什么，并轻轻寻找一个
   "独特结果"（White）—— 一个困境并未完全定义他们的瞬间。
3. **引导式提问** —— 四个苏格拉底式问题，覆盖"另一面 / 更大的画面 / 一个不太一样
   的瞬间 / 最重要的是什么"。默认布局是一次只看一题，可以点 "查看全部问题" 切换。
4. **浮现的回探** —— 四条尝试性线索（新看见的 / 仍未解的 / 似乎在指引的 / 你正在
   成为的样子），用户可以确认、标为接近或移除。**至少标记 2 条**才能继续，剩下
   的可选。
5. **结尾笔记** —— 一份小产物，三种模式之一：*我现在看到的* / *值得带走的* /
   *我想留住的*。系统会根据你确认的线索自动推荐一种，你也可以手动选别的。

最后这个产物会以一只**插画陶罐**的形式呈现 —— 罐身形状、釉色、釉面纹理和顶上
的植物全都来自你自己的文字（详见下面的"陶罐视觉系统"）。

---

## 理论框架

完整列表写在 system prompt 和 prompt builder 的注释里：

1. McAdams & McLean (2013) —— 叙事身份
2. White (2007) —— 叙事疗法地图（外化对话、再述对话、独特结果）
3. Morgan (2000) & Denborough (2014) —— 重新会员化、身份的迁移
4. Freire (2005) & Jemal (2017) —— 批判意识
5. Miller & Rollnick (2013) —— 动机式访谈
6. Schwartz et al. (2018) & Benet-Martínez & Haritatos (2005) —— 移民身份发展
7. Kim et al. (2025) —— 反思代理框架（IO / CR / RA / TM / SE 五原则）
8. Han (2025) —— 以叙事为中心的情绪反思（四个层次）

Schwartz 的四大价值类别同时驱动陶罐的釉色，Ekman 的情绪家族驱动陶罐的罐身。

---

## 架构

Next.js（Pages Router）+ React + Supabase + OpenAI。

```
pages/
  index.js              UI + 5 阶段状态机 + 陶罐视觉系统
  api/
    reflect.js          OpenAI 代理（system/user 角色拆分、限流、JSON 模式低温）
    data.js             Supabase 代理（service-role 密钥、按 session 查询）
lib/
  db.js                 客户端封装；POST 到 /api/data（服务器没配置时自动
                        降级到 localStorage）
  supabaseAdmin.js      仅服务器使用的 Supabase 客户端，使用
                        SUPABASE_SERVICE_ROLE_KEY
  supabase.js           已废弃 —— 旧的 anon-key 客户端；引入它会直接抛错
supabase/
  schema.sql            建表 + RLS（拒绝 anon 访问；只有 service_role 能读写）
```

### 为什么要 `/api/reflect` 和 `/api/data` 两个代理？

**浏览器一份凭证都不持有。** OpenAI 密钥和 Supabase service-role 密钥都只在
Vercel 的环境变量里。`/api/reflect` 是唯一能访问 OpenAI 的路径；`/api/data`
是唯一能访问数据库的路径。每个请求带一个客户端生成并存在 localStorage 的
session UUID；`/api/data` 在每个查询里都加 `eq('session_id', sessionId)` 过滤，
所以两个 UUID 不同的浏览器即使共用一个数据库后端，也无法读到对方的反思。

无登录的前提下，唯一的 "身份" 就是这个 localStorage UUID。如果别人知道了
你的 UUID（比如直接看你屏幕），就可能冒充你。这对研究原型可以接受；正式发布
时建议接入 Supabase Auth，把行按 `auth.uid()` 而不是 session_id 来分。

---

## 本地启动

需要 Node 18+ 和一个 Supabase 项目。

```bash
git clone https://github.com/ReneeMao/realization-moments.git
cd realization-moments
npm install
cp .env.example .env.local   # 然后填下面四个环境变量
npm run dev
```

### 必需的环境变量

| 变量 | 在哪里 | 谁用 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 仅服务器 | `pages/api/reflect.js` |
| `NEXT_PUBLIC_SUPABASE_URL` | 客户端 + 服务器 | `lib/db.js`, `lib/supabaseAdmin.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | 仅服务器 | `lib/supabaseAdmin.js` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 已不使用（保留兼容） | — |

如果 `SUPABASE_SERVICE_ROLE_KEY` 没设，`/api/data` 会返回 503，客户端会优雅地
降级到 localStorage —— 这对没接 Supabase 的快速本地调试很方便。

### 数据库初始化

打开 Supabase 控制台 → SQL Editor → 跑一遍 `supabase/schema.sql`。这会建好
`reflections` 和 `summaries` 两张表，开启 RLS 但不给 anon 任何 policy，并 drop
掉旧的 `allow_all_*` 策略（如果有）。

验证 anon 进不去：

```sql
SET ROLE anon;
SELECT * FROM reflections;   -- 应该 permission denied
RESET ROLE;
```

---

## 陶罐视觉系统

每一次反思都会产生一个独一无二的陶罐。视觉完全是**派生的** —— 除了一个确定性的
seed 之外，没有任何随机成分。

**罐身形状**（来自故事里的 Ekman 情绪家族）：

- `round`（圆罐）—— 喜悦 / 爱 / 安定（平静、安宁、感激）
- `tall`（高罐）—— 惊喜 / 恐惧（敬畏、焦虑、脆弱）
- `oval`（椭圆罐）—— 愤怒 / 悲伤（沮丧、悲恸、冲突）

如果文中没有任何情绪词，会回退到基于 `groundedness` / `openness` /
`complexity` 的几何形状逻辑。

**釉色**（来自 Schwartz 价值大类别）：

- `olive`（橄榄绿）—— Conservation（保守 —— 安全、家庭、传统、家、忠诚）
- `honey`（蜜色）—— Self-Enhancement（自我提升 —— 成就、成长、雄心、成功）
- `sage`（鼠尾草绿）—— Self-Transcendence（超越自我 —— 爱、善意、正义、智慧）
- `lavender`（薰衣草紫）—— Openness-to-change（开放变化 —— 创造、自由、好奇、冒险）
- `terracotta` / `bluegrey`（赤陶 / 灰蓝）—— 情绪编码的回退层

**釉面纹理**（来自写作的确定度 + 复杂度）：

- `wash`（平铺）—— 清晰、安顿的故事
- `pooled`（凝聚）—— 意义在中段汇聚
- `drift`（漂移）—— 对角线分区，两股拉力
- `satin`（缎面）—— 高度确定，陈述彼此对齐

**植物**（仅在 blooming 阶段；来自活力度）：

`sprout`（嫩芽）→ `pair`（双枝）→ `bud`（花蕾）→ `flower`（绽放）→ `branch`（分枝）

完整的评分逻辑见 `pages/index.js` 里的 `derivePotVisual`。

---

## 隐私与安全

- **没有账号。** 身份就是一个 localStorage UUID。
- **浏览器不持有任何凭证。** anon-key 对数据库的读写已被 RLS 拒绝；OpenAI 密钥
  从不离开服务器。
- **按 IP 限流。** `/api/reflect` 30 次/分钟，`/api/data` 60 次/分钟。在
  Vercel 冷启动间会重置 —— 是 best-effort，不是强保护。
- **隐私提醒。** 第一阶段的回应里会带一句简短提醒，请避免写下全名、学校、工作
  地点和移民信息。
- **安全分流。** 如果用户的文字暗示自伤、自杀念头、虐待或严重痛苦，system prompt
  会让模型停止反思流程，仅返回 988 / 741741 / findahelpline.com 的求助资源。
  这是 prompt 层面的硬性指令，模型被告知忽略其它一切只回这条信息。
- **Prompt 注入防御。** 用户故事被 `<USER_STORY>…</USER_STORY>` 标签包裹，
  system prompt 明确指示模型把标签内的内容只当作叙事，永远不当作指令
  （OWASP LLM01）。
- **多语言。** 所有 UI 文案、prompt、错误回退都支持英文和简体中文。

---

## 部署到 Vercel

1. push 到 GitHub。
2. 在 Vercel 里 Import 这个仓库。
3. 在 Project Settings → Environment Variables 添加 `OPENAI_API_KEY`、
   `NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 三个变量。
4. 在 Supabase 项目里重新跑一遍 `supabase/schema.sql`，确保 RLS 已锁。
5. Deploy。

Vercel 的 serverless function 实例之间不共享内存，所以内存型限流是 best-effort。
要更强的保护可以在 `pages/api/reflect.js` 和 `pages/api/data.js` 里接 Upstash
Redis 或 Vercel KV。

---

## 免责声明

这个工具不是治疗、咨询、危机支持或临床照护。它无法做出任何诊断，也不能替你
决定与你的身心健康有关的事。它不是真正人类陪伴或专业帮助的替代品。所有产出
都是 AI 生成的草稿，可能不完整或错误。**对自己故事的解释权始终属于使用者本人** ——
工具产出的任何东西都不是关于"你是谁"的最终答案。

如果你正处在痛苦中，请联系一个能真正陪伴你的人，或者下面的资源：

- **988** 自杀与危机干预热线（call / text，美国）
- **741741** 危机短信热线（text HOME）
- **findahelpline.com**

中国大陆：北京心理危机研究与干预中心 **010-82951332** / **400-161-9995**。

---

## 许可

研究原型，许可方式联系仓库所有者。
