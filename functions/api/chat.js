/**
 * HSD 纳新站 · Cloudflare Pages Function
 * 代理 AI 对话请求到 TokenDance（OpenAI 兼容网关），避免 API Key 暴露在前端。
 *
 * 环境变量（在 Cloudflare Pages -> Settings -> Environment variables 配置）：
 *   AI_API_KEY        TokenDance 密钥（sk-...）
 *   AI_BASE_URL       https://tokendance.space/gateway/v1
 *   AI_MODEL          deepseek-v4-flash
 *   AI_SYSTEM_PROMPT  系统人设（可选）
 *   RATE_LIMIT        每 IP 每分钟最大请求数（可选，默认 20）
 */

const MAX_BODY = 64 * 1024;

/* 简易内存限流：单个 isolate 内有效，跨边缘节点不精确，仅作基础保护 */
const rateBuckets = new Map();

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const API_KEY = env.AI_API_KEY || '';
  if (!API_KEY) {
    return json(500, { error: '服务端未配置 AI_API_KEY，请在 Pages 环境变量中设置' });
  }

  /* 简易限流 */
  const RATE_LIMIT = parseInt(env.RATE_LIMIT || '20', 10);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const rec = rateBuckets.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + windowMs; }
  rec.count += 1;
  rateBuckets.set(ip, rec);
  if (rec.count > RATE_LIMIT) {
    return json(429, { error: '请求过于频繁，请稍后再试' });
  }

  /* 读取请求体 */
  let payload;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json(413, { error: '消息过长' });
    payload = JSON.parse(raw);
  } catch (e) {
    return json(400, { error: '请求体不是合法 JSON' });
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) return json(400, { error: '消息不能为空' });
  if (message.length > 4000) return json(400, { error: '消息不能超过 4000 字' });

  const BASE_URL = (env.AI_BASE_URL || 'https://tokendance.space/gateway/v1').replace(/\/+$/, '');
  const MODEL = env.AI_MODEL || 'deepseek-v4-flash';
  const SYSTEM_PROMPT = env.AI_SYSTEM_PROMPT || '你是一位友善、热情的大学社团纳新助手，回答简洁自然，适当使用表情符号增强亲和力。';

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message }
    ],
    temperature: 0.7
  };

  try {
    const resp = await fetch(BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      let detail = '';
      try { detail = await resp.text(); } catch (e) { /* 忽略 */ }
      return json(502, { error: '模型服务返回 ' + resp.status + '：' + detail.slice(0, 200) });
    }
    const data = await resp.json();
    const reply = data && data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      return json(502, { error: '模型返回为空' });
    }
    return json(200, { reply });
  } catch (e) {
    return json(502, { error: '无法连接模型服务：' + (e.message || e) });
  }
}
