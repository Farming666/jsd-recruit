/**
 * HSD 纳新站 · 简易 AI 后端
 * ============================================================
 * 作用：
 *   1. 代理大模型 API（OpenAI 兼容协议），避免 APIKey 出现在
 *      前端代码 / 公开网页 / 浏览器控制台中；
 *   2. 同时托管 hsd.html 等静态文件，前端与后端同域部署最简单。
 *
 * 运行：
 *   npm 无需安装任何依赖（Node 18+ 自带 fetch）。
 *   1) 复制 .env.example 为 .env 并填写 AI_API_KEY / AI_MODEL 等；
 *   2) node server.js
 *   3) 浏览器打开 http://localhost:3000/
 *
 * 公开部署：
 *   将本目录整体上传到云服务器（或任意支持 Node 的平台），
 *   设置环境变量后运行 node server.js，并用 Nginx/Caddy 反代 + HTTPS。
 *   详细说明见 README.md。
 * ============================================================
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

/* ---------- 配置加载：环境变量优先，其次同目录 .env ---------- */
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    fs.readFileSync(envPath, 'utf8')
        .split(/\r?\n/)
        .forEach(function(line) {
            line = line.trim();
            if (!line || line.startsWith('#')) return;
            const eq = line.indexOf('=');
            if (eq < 1) return;
            const k = line.slice(0, eq).trim();
            const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
            if (!(k in process.env)) process.env[k] = v;
        });
}
loadEnv();

const PORT = parseInt(process.env.PORT || '3000', 10);
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const AI_MODEL = process.env.AI_MODEL || '';
const AI_SYSTEM_PROMPT = process.env.AI_SYSTEM_PROMPT || '你是一位友善、热情的大学社团纳新助手，回答简洁自然，适当使用表情符号增强亲和力。';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || ''; // 前后端分离部署时填前端域名，如 https://xxx.github.io
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '20', 10); // 每 IP 每分钟最多请求数
const MAX_BODY = 64 * 1024; // 请求体上限 64KB

const ROOT = __dirname;
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.md': 'text/markdown; charset=utf-8'
};

/* ---------- 简易内存限流（防止 key 被刷爆） ---------- */
const hits = new Map();
function rateLimit(ip) {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const rec = hits.get(ip) || { count: 0, resetAt: now + windowMs };
    if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + windowMs; }
    rec.count += 1;
    hits.set(ip, rec);
    if (hits.size > 5000) { // 定期清理过期条目，防止内存膨胀
        for (const [k, v] of hits) {
            if (v.resetAt < now) hits.delete(k);
        }
    }
    return rec.count > RATE_LIMIT;
}

/* ---------- 小工具 ---------- */
function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}
function sendText(res, status, text) {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(text);
}
function applyCors(req, res) {
    const origin = req.headers.origin;
    if (ALLOW_ORIGIN && origin && origin === ALLOW_ORIGIN) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Vary', 'Origin');
    }
}
function clientIp(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

/* ---------- AI 对话代理 ---------- */
async function proxyChat(message) {
    if (!AI_API_KEY) {
        throw Object.assign(new Error('服务端未配置 AI_API_KEY，请参照 .env.example 设置'), { status: 500 });
    }
    const body = {
        model: AI_MODEL,
        messages: [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            { role: 'user', content: message }
        ],
        temperature: 0.7
    };
    const ctrl = new AbortController();
    const timer = setTimeout(function() { ctrl.abort(); }, 60000);
    let res;
    try {
        res = await fetch(AI_BASE_URL + '/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + AI_API_KEY
            },
            body: JSON.stringify(body),
            signal: ctrl.signal
        });
    } catch (e) {
        clearTimeout(timer);
        const msg = e.name === 'AbortError' ? '模型响应超时' : '无法连接模型服务：' + e.message;
        throw Object.assign(new Error(msg), { status: 502 });
    }
    clearTimeout(timer);
    if (!res.ok) {
        let detail = '';
        try { detail = await res.text(); } catch (e) { /* 忽略 */ }
        throw Object.assign(new Error('模型服务返回 ' + res.status + '：' + detail.slice(0, 200)), { status: 502 });
    }
    const data = await res.json();
    const reply = data && data.choices && data.choices[0] &&
        data.choices[0].message && data.choices[0].message.content;
    if (typeof reply !== 'string' || !reply.trim()) {
        throw Object.assign(new Error('模型返回为空'), { status: 502 });
    }
    return reply;
}

/* ---------- HTTP 服务 ---------- */
const server = http.createServer(function(req, res) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, 'http://' + req.headers.host).pathname);
    } catch (e) {
        return sendText(res, 400, 'Bad Request');
    }

    /* API：AI 对话代理 */
    if (pathname === '/api/chat' && req.method === 'POST') {
        if (rateLimit(clientIp(req))) {
            return sendJson(res, 429, { error: '请求过于频繁，请稍后再试' });
        }
        let raw = '';
        let tooLarge = false;
        req.on('data', function(chunk) {
            raw += chunk;
            if (raw.length > MAX_BODY) { tooLarge = true; req.destroy(); }
        });
        req.on('end', async function() {
            if (tooLarge) return sendJson(res, 413, { error: '消息过长' });
            let payload;
            try { payload = JSON.parse(raw); } catch (e) { return sendJson(res, 400, { error: '请求体不是合法 JSON' }); }
            const message = typeof payload.message === 'string' ? payload.message.trim() : '';
            if (!message) return sendJson(res, 400, { error: '消息不能为空' });
            if (message.length > 4000) return sendJson(res, 400, { error: '消息不能超过 4000 字' });
            try {
                const reply = await proxyChat(message);
                sendJson(res, 200, { reply: reply });
            } catch (e) {
                sendJson(res, e.status || 500, { error: e.message });
            }
        });
        return;
    }

    /* API：健康检查（可用于部署探活，不暴露 key 本身） */
    if (pathname === '/api/health') {
        return sendJson(res, 200, { ok: true, model: AI_MODEL, hasKey: !!AI_API_KEY });
    }

    /* 静态文件托管 */
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return sendText(res, 405, 'Method Not Allowed');
    }
    let filePath = path.normalize(path.join(ROOT, pathname));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
        return sendText(res, 403, 'Forbidden'); // 路径穿越防护
    }
    if (pathname === '/' || pathname.endsWith('/')) {
        filePath = path.join(ROOT, 'index.html');
    }
    fs.stat(filePath, function(err, stat) {
        if (err || !stat.isFile()) {
            if ((pathname === '/' || pathname.endsWith('/')) && filePath.endsWith('index.html')) {
                // 目录下无 index.html 时回退到 hsd.html（本页主入口）
                const fallback = path.join(ROOT, 'hsd.html');
                return fs.stat(fallback, function(err2, stat2) {
                    if (err2 || !stat2.isFile()) return sendText(res, 404, 'Not Found');
                    serveFile(res, req, fallback, stat2);
                });
            }
            return sendText(res, 404, 'Not Found');
        }
        serveFile(res, req, filePath, stat);
    });
});

function serveFile(res, req, filePath, stat) {
    if (filePath.endsWith('.env')) return sendText(res, 403, 'Forbidden'); // 禁止直接下载 .env
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(filePath).pipe(res);
}

server.listen(PORT, function() {
    console.log('HSD AI 后端已启动: http://localhost:' + PORT);
    console.log('模型: ' + (AI_MODEL || '(未设置 AI_MODEL，请在 .env 中填写)'));
    console.log('APIKey: ' + (AI_API_KEY ? '已配置' : '未配置（AI 对话将不可用）'));
});
