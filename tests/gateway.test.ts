import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyApi } from '../server/gateway.js';
const frontend = 'https://cognexus.example.org',
  backendOrigin = 'https://research-service.example.org';
test('Vercel gateway fails closed without a valid distinct HTTPS backend and never creates local accounts', async () => {
  for (const configured of [
    undefined,
    'http://insecure.example.org',
    frontend,
    'https://user:password@service.example.org',
    'https://service.example.org/private',
  ]) {
    let called = false;
    const response = await proxyApi(new Request(frontend + '/api/session'), {
      backendOrigin: configured,
      transport: async () => {
        called = true;
        throw new Error();
      },
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'BACKEND_NOT_CONFIGURED');
    assert.equal(called, false);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
});
test('Vercel gateway preserves API verification/cookies while stripping untrusted forwarding headers and routing parameters', async () => {
  const headers = new Headers({
    'content-type': 'application/json',
    cookie: '__Host-cognexus=synthetic-session',
    'x-cognexus-request': '1',
    origin: frontend,
    'x-forwarded-for': 'attacker-controlled',
  });
  let calls = 0;
  const response = await proxyApi(
    new Request(frontend + '/api/projects?__cognexus_path=projects&filter=active', {
      method: 'POST',
      headers,
      body: '{"name":"Synthetic project"}',
    }),
    {
      backendOrigin,
      transport: async (url, init) => {
        calls++;
        assert.equal(String(url), backendOrigin + '/api/projects?filter=active');
        assert.equal(new Headers(init?.headers).get('cookie'), '__Host-cognexus=synthetic-session');
        assert.equal(new Headers(init?.headers).get('origin'), frontend);
        assert.equal(new Headers(init?.headers).get('x-forwarded-for'), null);
        assert.equal(init?.redirect, 'manual');
        const out = new Headers({
          'content-type': 'application/json',
          'cache-control': 'public, max-age=600',
        });
        out.append(
          'set-cookie',
          '__Host-cognexus=rotated-synthetic-session; Path=/; Secure; HttpOnly; SameSite=Lax',
        );
        return new Response('{"ok":true}', { status: 201, headers: out });
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(response.headers.get('set-cookie') || '', /HttpOnly/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
});
test('Vercel gateway never follows backend redirects or exposes internal failures', async () => {
  const response = await proxyApi(new Request(frontend + '/api/session'), {
    backendOrigin,
    transport: async () =>
      new Response(null, { status: 302, headers: { location: 'https://untrusted.example.org' } }),
  });
  assert.equal(response.status, 502);
  const failed = await proxyApi(new Request(frontend + '/api/session'), {
    backendOrigin,
    transport: async () => {
      throw new Error('synthetic-private-path-and-secret');
    },
  });
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes('synthetic-private'));
});
test('Vercel gateway bounds request/response bodies and refuses path escapes', async () => {
  const huge = 'x'.repeat(4 * 1024 * 1024 + 1);
  const response = await proxyApi(
    new Request(frontend + '/api/projects', { method: 'POST', body: huge }),
    {
      backendOrigin,
      transport: async () => {
        throw new Error('Must not forward');
      },
    },
  );
  assert.equal(response.status, 413);
  const download = await proxyApi(new Request(frontend + '/api/files/synthetic/download'), {
    backendOrigin,
    transport: async () => new Response(huge),
  });
  assert.equal(download.status, 413);
  for (const path of [
    '../private',
    '//untrusted.example.org',
    '%2e%2e/private',
    'files\\private',
  ]) {
    const url = new URL(frontend + '/api/gateway');
    url.searchParams.set('__cognexus_path', path);
    const result = await proxyApi(new Request(url), {
      backendOrigin,
      transport: async () => {
        throw new Error('Must not forward');
      },
    });
    assert.equal(result.status, 400);
  }
});
