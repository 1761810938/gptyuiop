const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const HOST = '127.0.0.1';
const PORT = process.env.PORT || 8787;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end(text);
}

function normalizeBaseUrl(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('请填写 API 地址');
  }

  const trimmed = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('API 地址必须以 http:// 或 https:// 开头');
  }

  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;

      if (raw.length > 20 * 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });

    req.on('error', reject);
  });
}

function buildChatPayload({ model, messages, temperature, max_tokens, stream = false, reasoning_effort = 'auto' }) {
  const payload = {
    model,
    messages,
    temperature: typeof temperature === 'number' ? temperature : 0.7,
    stream
  };

  if (typeof max_tokens === 'number' && Number.isFinite(max_tokens) && max_tokens > 0) {
    payload.max_tokens = max_tokens;
  }

  if (typeof reasoning_effort === 'string' && reasoning_effort && reasoning_effort !== 'auto') {
    payload.reasoning_effort = reasoning_effort;
  }

  return payload;
}

async function proxyOpenAiRequest({ baseUrl, apiKey, endpoint, body, method = 'POST' }) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const target = new URL(endpoint, `${normalizedBase}/`);

  const response = await fetch(target, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: method === 'GET' ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || `请求失败（${response.status}）`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

async function proxyOpenAiStream({ baseUrl, apiKey, body }) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const target = new URL('chat/completions', `${normalizedBase}/`);

  return fetch(target, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

function sanitizePath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath.split('?')[0]);
  const safePath = decodedPath === '/' ? '/index.html' : decodedPath;
  const normalized = path.normalize(safePath).replace(/^([.][.][/\\])+/, '');
  return path.join(PUBLIC_DIR, normalized);
}

function serveStaticFile(req, res) {
  const filePath = sanitizePath(req.url || '/');

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        sendText(res, 404, 'Not Found');
        return;
      }

      sendText(res, 500, 'Server Error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream'
    });
    res.end(content);
  });
}

function validateChatInput({ apiKey, model, messages }) {
  if (!apiKey) {
    return '请填写 API Key';
  }

  if (!model) {
    return '请填写模型名称';
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return '消息不能为空';
  }

  return null;
}

async function handleModels(req, res) {
  try {
    const { baseUrl, apiKey } = await readJsonBody(req);

    if (!apiKey) {
      sendJson(res, 400, { error: '请填写 API Key' });
      return;
    }

    const data = await proxyOpenAiRequest({
      baseUrl,
      apiKey,
      endpoint: 'models',
      body: undefined,
      method: 'GET'
    });

    sendJson(res, 200, data);
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || '获取模型列表失败',
      details: error.details || null
    });
  }
}

async function handleChat(req, res) {
  try {
    const input = await readJsonBody(req);
    const { baseUrl, apiKey, model, messages, temperature, max_tokens, reasoning_effort } = input;
    const validationError = validateChatInput({ apiKey, model, messages });

    if (validationError) {
      sendJson(res, 400, { error: validationError });
      return;
    }

    const data = await proxyOpenAiRequest({
      baseUrl,
      apiKey,
      endpoint: 'chat/completions',
      body: buildChatPayload({ model, messages, temperature, max_tokens, reasoning_effort })
    });

    sendJson(res, 200, {
      ...data,
      request_model: model
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message || '聊天请求失败',
      details: error.details || null
    });
  }
}

async function handleChatStream(req, res) {
  try {
    const input = await readJsonBody(req);
    const { baseUrl, apiKey, model, messages, temperature, max_tokens, reasoning_effort } = input;
    const validationError = validateChatInput({ apiKey, model, messages });

    if (validationError) {
      sendJson(res, 400, { error: validationError });
      return;
    }

    const upstreamResponse = await proxyOpenAiStream({
      baseUrl,
      apiKey,
      body: buildChatPayload({ model, messages, temperature, max_tokens, stream: true, reasoning_effort })
    });

    if (!upstreamResponse.ok) {
      const text = await upstreamResponse.text();
      let details;

      try {
        details = text ? JSON.parse(text) : {};
      } catch {
        details = { raw: text };
      }

      sendJson(res, upstreamResponse.status, {
        error: details?.error?.message || details?.message || `请求失败（${upstreamResponse.status}）`,
        details
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    res.write(`event: meta\ndata: ${JSON.stringify({ request_model: model })}\n\n`);

    for await (const chunk of upstreamResponse.body) {
      res.write(chunk);
    }

    res.end();
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, error.status || 500, {
        error: error.message || '流式聊天请求失败',
        details: error.details || null
      });
      return;
    }

    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || '流式聊天请求失败' })}\n\n`);
    res.end();
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendText(res, 400, 'Bad Request');
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    await handleChat(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat/stream') {
    await handleChatStream(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/models') {
    await handleModels(req, res);
    return;
  }

  if (req.method === 'GET') {
    serveStaticFile(req, res);
    return;
  }

  sendText(res, 405, 'Method Not Allowed');
});

server.listen(PORT, HOST, () => {
  console.log(`OpenAI 兼容聊天网页已启动: http://${HOST}:${PORT}`);
});
