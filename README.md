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
| `hsd.html` | 前端页面（已接入 `/api/chat`，AI 图标已修复） |
| `server.js` | 简易 Node 后端：静态托管 + AI 代理 + 简易限流，零依赖 |
| `.env.example` | 配置模板（复制为 `.env` 使用） |
| `.gitignore` | 已忽略 `.env`，防止密钥入库 |

## 本地运行

前置要求：Node.js 18 及以上（本机已装 v20，无需安装任何 npm 包）。

```bash
# 1. 创建配置
copy .env.example .env
# 2. 编辑 .env，至少填 AI_API_KEY 与 AI_MODEL（模板内有各家平台示例）
# 3. 启动
node server.js
# 4. 浏览器打开 http://localhost:3000/ 即可使用
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

## 公开部署（推荐方案）

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
