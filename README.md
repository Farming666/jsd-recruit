---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 1688293c7921b85db8eda8e6d67e9bb9_db6042fba28c11f1bc17525400826444
    ReservedCode1: vdtda81O2pRbnPSn+ZkJW3xHOBGHyZkEYvI/1qWhz21xLlNPTGMRrzc2lPwIYasOpcjdz3GtrfcbWZ1WmkPW4kaqSq57SBtNtsgC6dQgQs13K669rpIEYrb7iCUQeIt7qs0boMnDZmJejZxUjGvFuzGOpx62Rheu7WTT2vY3fr1JQU5Bnp2iBkw6G9A=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 1688293c7921b85db8eda8e6d67e9bb9_db6042fba28c11f1bc17525400826444
    ReservedCode2: vdtda81O2pRbnPSn+ZkJW3xHOBGHyZkEYvI/1qWhz21xLlNPTGMRrzc2lPwIYasOpcjdz3GtrfcbWZ1WmkPW4kaqSq57SBtNtsgC6dQgQs13K669rpIEYrb7iCUQeIt7qs0boMnDZmJejZxUjGvFuzGOpx62Rheu7WTT2vY3fr1JQU5Bnp2iBkw6G9A=
---

# HSD 纳新站 · AI 对话简易后端

让网页中的 AI 对话调用大模型 API，同时**不把 APIKey 暴露到前端/公开页面**：前端只请求本站 `/api/chat`，由后端代为调用大模型服务。

## 文件清单

| 文件 | 说明 |
|------|------|
| `index.html` | 前端页面（Cloudflare Pages 入口，与 `hsd.html` 内容一致） |
| `hsd.html` | 前端页面副本（`/hsd`、`/hsd.html` 已配置 301 到首页） |
| `server.js` | 本地 Node 开发服务器：静态托管 + AI 代理 + 简易限流，零依赖（部署 Cloudflare 时无需使用） |
| `functions/api/chat.js` | Cloudflare Pages Function：AI 对话代理（部署时使用） |
| `_headers` | Cloudflare 响应头与缓存策略 |
| `_redirects` | Cloudflare 重定向规则 |
| `.gitignore` | 已忽略 `.env`，防止密钥入库 |

## 本地运行

前置要求：Node.js 18 及以上（本机已装 v20，无需安装任何 npm 包）。

```bash
# 1. 创建配置（模板见 server.js 顶部注释，或参考 functions/api/chat.js 的环境变量说明）
# 在项目根目录新建 .env 并填入：
#   AI_API_KEY=sk-xxx
#   AI_BASE_URL=https://api.openai.com/v1
#   AI_MODEL=deepseek-chat
# 2. 启动
node server.js
# 3. 浏览器打开 http://localhost:3000/ 即可使用
```

也可不建 `.env`，直接以环境变量方式传入：

```bash
set AI_API_KEY=sk-xxx && set AI_MODEL=deepseek-chat && node server.js
```

## 接口说明

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/chat` | POST | 请求体 `{"message": "你的问题"}`，返回 `{"reply": "AI 回复"}` |
| `/api/health` | GET | 健康检查，返回 `{"ok": true, "model": ..., "hasKey": ...}` |

## 方案一：Cloudflare Pages 部署（推荐，免费）

本项目已改造为 Cloudflare Pages 可直接部署的静态站点格式：

- 入口：`index.html`（`/hsd`、`/hsd.html` 已配置 301 到首页）
- 静态资源：`img/` 相对路径引用，`_headers` 已配置安全头与图片长缓存
- AI 对话：由 `functions/api/chat.js`（Pages Functions）代理，前端仍请求同域 `/api/chat`，零跨域

### 方式 A：连接 GitHub 自动构建（推荐）

1. 将本目录推送到 GitHub 仓库（`.env` 已被 `.gitignore` 忽略，不会入库）。
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git，选择该仓库。
3. 构建配置：
   - Build command：留空（纯静态，无需构建）
   - Build output directory：`/`（根目录）
4. 部署后在 Pages → Settings → Environment variables 配置：
   - `AI_API_KEY`：TokenDance / 大模型网关密钥（必填）
   - `AI_BASE_URL`：默认 `https://tokendance.space/gateway/v1`（可选）
   - `AI_MODEL`：默认 `deepseek-v4-flash`（可选）
   - `AI_SYSTEM_PROMPT`：AI 人设（可选）
   - `RATE_LIMIT`：单 IP 每分钟限流，默认 20（可选）
5. 保存后重新部署一次，AI 对话即可使用。

> 注意：修改环境变量后需在 Deployments 页面手动 Retry 或重新部署才生效。

### 方式 B：Wrangler CLI 直传

```bash
npm install -g wrangler
wrangler pages deploy D:\JavaProjects\jsd-recruit\JSD_8_25 --project-name hsd-recruit
```

### 本地预览（模拟 Pages Functions 环境）

```bash
npx wrangler pages dev D:\JavaProjects\jsd-recruit\JSD_8_25
```

## 方案二：Node 云服务器部署（本地/自建服务器）

1. **买一台云服务器**（腾讯云/阿里云轻量即可，学生优惠很便宜），本目录整体上传。
2. 服务器装 Node.js，设置环境变量（或上传 `.env`，注意 `.env` 不要外泄）。
3. 用 PM2 守护进程：`pm2 start server.js --name hsd-ai`
4. 用 Nginx/Caddy 反代到 3000 端口并配置 HTTPS（有域名体验最好，没有也可用 IP + HTTPS）。

部署后把 `hsd.html` 与 `server.js` 放**同一目录**同域访问即可，前端无需改动。

## 前后端分离部署（可选）

如果页面想放 GitHub Pages / Vercel 等纯静态托管，AI 请求会跨域，需要：

1. 后端 `server.js` 设置环境变量 `ALLOW_ORIGIN=https://你的前端域名`（CORS 白名单）。
2. 在 `hsd.html` 中把 `AI_API_ENDPOINT` 改为后端完整地址：
   ```js
   const AI_API_ENDPOINT = 'https://你的后端域名/api/chat';
   ```

## 安全说明

- APIKey 只存在于服务端环境变量 / `.env`，**绝不写进前端代码**，浏览器和访客均无法看到。
- 服务端限制单 IP 每分钟请求数（默认 20，可用 `RATE_LIMIT` 调整），防止 key 被刷爆。
- `.env` 文件已被服务端禁止直接下载，且已加入 `.gitignore`。
- 建议生产环境走 HTTPS，避免请求被中间人窃听。
- 需要更强防护（账号体系、持久会话、更多轮上下文）时，可在此基础上扩展。
*（内容由AI生成，仅供参考）*
