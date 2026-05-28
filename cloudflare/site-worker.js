const UPSTREAM_BASE_URL = 'https://aiapi.setbug.cn/v1';
const ALLOWED_API_PATHS = new Set(['/v1/models', '/v1/chat/completions']);

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';

  return {
    'Access-Control-Allow-Origin': origin,
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

  if (!ALLOWED_API_PATHS.has(requestUrl.pathname)) {
    return null;
  }

  const upstreamUrl = new URL(`${UPSTREAM_BASE_URL}${requestUrl.pathname.replace(/^\/v1/, '')}`);
  upstreamUrl.search = requestUrl.search;
  return upstreamUrl;
}

async function proxyApiRequest(request) {
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
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/v1/')) {
      return proxyApiRequest(request);
    }

    return env.ASSETS.fetch(request);
  }
};
