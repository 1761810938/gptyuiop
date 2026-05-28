const UPSTREAM_BASE_URL = 'https://aiapi.setbug.cn/v1';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'OPTIONS']);
const ALLOWED_PATHS = new Set(['models', 'chat/completions']);

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

function getPath(context) {
  return (context.params.path || []).join('/');
}

function getUpstreamUrl(context) {
  const pathname = getPath(context);

  if (!ALLOWED_PATHS.has(pathname)) {
    return null;
  }

  const requestUrl = new URL(context.request.url);
  const upstreamUrl = new URL(`${UPSTREAM_BASE_URL}/${pathname}`);
  upstreamUrl.search = requestUrl.search;
  return upstreamUrl;
}

export async function onRequest(context) {
  const { request } = context;

  if (!ALLOWED_METHODS.has(request.method)) {
    return withCors(new Response('Method Not Allowed', { status: 405 }), request);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request)
    });
  }

  const upstreamUrl = getUpstreamUrl(context);
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
