# 弈境 Renju Pro Arena

一个完整可运行的前端五子棋全站项目，包含人机对弈、自由/指定开局、禁手判定、计时、悔棋、棋谱保存、登录注册、管理员后台和 Supabase 数据层。

## 本地运行

```bash
npm install
npm run dev
```

## 构建部署

```bash
npm run build
```

构建产物在 `dist`，可部署到 Vercel、Netlify、静态服务器或对象存储。

## Supabase 配置

复制 `.env.example` 为 `.env`，填写：

```env
VITE_SUPABASE_URL=你的 Supabase URL
VITE_SUPABASE_ANON_KEY=你的 Supabase anon key
VITE_ADMIN_EMAIL=管理员邮箱
```

在 Supabase SQL Editor 执行 `supabase/schema.sql`。管理员账号需先通过注册或 Supabase Auth 创建，然后把 `profiles.role` 设置为 `admin`，或使用 `VITE_ADMIN_EMAIL` 对应邮箱登录进入前端管理员入口。

未配置 Supabase 时，项目仍可进行本地对局，棋谱保存到当前浏览器。

## 功能范围

- 15×15 标准棋盘
- 黑先白后，交替落子
- 黑棋三三、四四、长连禁手
- 黑棋五连优先胜利，白棋长连胜利
- 自由开局模式
- 指定开局模式，内置直指/斜指 26 种开局
- 三手交换
- 五手 N 打
- 本地强 AI：候选点、局面评分、禁手过滤、Alpha-Beta 搜索、置换表
- 计时、悔棋、棋谱保存和浏览
- Supabase 登录、注册、管理员后台
