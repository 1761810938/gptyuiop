const UPSTREAM_BASE_URL = 'https://aiapi.setbug.cn/v1';
const ALLOWED_ORIGINS = new Set([
  'https://1761810938.github.io'
]);

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://1761810938.github.io';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function withCors(response, request) {
  const nextResponse = new Response(response.body, response);
  const corsHeaders = getCorsHeaders(request);

  for (const [key, value] of Object.entries(corsHeaders)) {
    nextResponse.headers.set(key, value);
  }

  return nextResponse;
}

function getUpstreamUrl(request) {
  const requestUrl = new URL(request.url);
  const upstreamBaseUrl = new URL(UPSTREAM_BASE_URL);
  const pathname = requestUrl.pathname.replace(/^\/+/, '');

  if (!['models', 'chat/completions'].includes(pathname)) {
    return null;
  }

  upstreamBaseUrl.pathname = `${upstreamBaseUrl.pathname.replace(/\/+$/, '')}/${pathname}`;
  upstreamBaseUrl.search = requestUrl.search;
  return upstreamBaseUrl;
}

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request)
    });
  }

  if (!['GET', 'POST'].includes(request.method)) {
    return withCors(new Response('Method Not Allowed', { status: 405 }), request);
  }

  const upstreamUrl = getUpstreamUrl(request);
  if (!upstreamUrl) {
    return withCors(new Response('Not Found', { status: 404 }), request);
  }

  const headers = new Headers();
  const authorization = request.headers.get('Authorization');
  const contentType = request.headers.get('Content-Type');

  if (authorization) {
    headers.set('Authorization', authorization);
  }

  if (contentType) {
    headers.set('Content-Type', contentType);
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' ? undefined : request.body,
    redirect: 'manual'
  });

  return withCors(upstreamResponse, request);
}

export default {
  fetch: handleRequest
};
