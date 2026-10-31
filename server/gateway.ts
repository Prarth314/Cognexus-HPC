// Vercel hosts the web UI; persistent research execution stays on the backend.
// No account/data fallback is created when the backend is absent.
const limit = 4 * 1024 * 1024;
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Cognexus-Max-Upload-Bytes': String(3 * 1024 * 1024),
};
function failure(status: number, error: string, code: string) {
  return Response.json({ error, code }, { status, headers: privateHeaders });
}
async function bounded(body: ReadableStream<Uint8Array> | null) {
  if (!body) return undefined;
  const reader = body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RangeError('Gateway payload limit');
      }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    reader.releaseLock();
  }
}
export async function proxyApi(
  request: Request,
  options: { backendOrigin?: string; transport?: typeof fetch } = {},
) {
  const input = new URL(request.url);
  let backend: URL;
  try {
    backend = new URL(options.backendOrigin || '');
    if (
      backend.protocol !== 'https:' ||
      backend.username ||
      backend.password ||
      backend.pathname !== '/' ||
      backend.search ||
      backend.hash ||
      backend.origin === input.origin
    )
      throw new Error();
  } catch {
    return failure(
      503,
      'The research service has not been connected to this website. The project owner must configure the persistent Cognexus backend.',
      'BACKEND_NOT_CONFIGURED',
    );
  }
  if (!['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method))
    return failure(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  const path = input.searchParams.get('__cognexus_path') || input.pathname.replace(/^\/api\//, '');
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '.' || segment === '..') ||
    /%(?:2f|5c|2e)/i.test(path)
  )
    return failure(400, 'Invalid API path', 'INVALID_PATH');
  backend.pathname = '/api/' + path;
  input.searchParams.delete('__cognexus_path');
  backend.search = input.searchParams.toString();
  const headers = new Headers();
  for (const name of [
    'cookie',
    'content-type',
    'x-cognexus-request',
    'origin',
    'sec-fetch-site',
    'idempotency-key',
    'authorization',
  ]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  let body: Buffer | undefined;
  try {
    body = await bounded(request.body);
  } catch {
    return failure(413, 'This deployment accepts API payloads up to 4 MiB.', 'PAYLOAD_TOO_LARGE');
  }
  try {
    const upstream = await (options.transport || fetch)(backend, {
      method: request.method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return failure(
        502,
        'The research service returned an unexpected redirect.',
        'BACKEND_UNAVAILABLE',
      );
    }
    const content = await bounded(upstream.body),
      out = new Headers(privateHeaders);
    for (const name of ['content-type', 'content-disposition', 'x-cognexus-session']) {
      const value = upstream.headers.get(name);
      if (value !== null) out.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) out.append('set-cookie', cookie);
    return new Response(
      request.method === 'HEAD' || [204, 205, 304].includes(upstream.status) ? null : content,
      { status: upstream.status, headers: out },
    );
  } catch (error) {
    return error instanceof RangeError
      ? failure(413, 'This deployment supports downloads up to 4 MiB.', 'PAYLOAD_TOO_LARGE')
      : failure(
          502,
          'The research service is currently unavailable. Please try again later.',
          'BACKEND_UNAVAILABLE',
        );
  }
}
