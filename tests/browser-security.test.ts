import test from 'node:test';
import assert from 'node:assert/strict';
import { api, endSession, startSession, ApiError, loadSession } from '../web/api.js';

test('initial session retries a transient API startup failure and rejects static HTML', async () => {
  const original = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async () =>
      ++calls === 1
        ? new Response('proxy unavailable', { status: 502 })
        : new Response(JSON.stringify({ user: null, registrationRestricted: false }), {
            headers: { 'content-type': 'application/json' },
          });
    assert.deepEqual(await loadSession(), { user: null, registrationRestricted: false });
    assert.equal(calls, 2);
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json(
        { error: 'Research service is not connected', code: 'BACKEND_NOT_CONFIGURED' },
        { status: 503 },
      );
    };
    await assert.rejects(loadSession(), /not connected/);
    assert.equal(calls, 1);
    globalThis.fetch = async () =>
      new Response('<html>Static host</html>', { headers: { 'content-type': 'text/html' } });
    await assert.rejects(api('/session'), /static website alone/);
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    await assert.rejects(
      api('/session'),
      (error) =>
        error instanceof ApiError && error.status === 0 && error.message.includes('Cannot reach'),
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('browser discards late private responses after logout and stale failures after another login', async () => {
  const originalFetch = globalThis.fetch,
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events = new EventTarget();
  let ended = 0;
  events.addEventListener('cognexus:session-ended', () => ended++);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events });
  try {
    let deliver!: (response: Response) => void;
    globalThis.fetch = () =>
      new Promise((resolve) => {
        deliver = resolve;
      });
    const pending = api('/projects');
    endSession();
    deliver(
      new Response(JSON.stringify([{ name: 'previous private project' }]), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    await assert.rejects(pending, (error) => error instanceof ApiError && error.status === 401);
    const previous = api('/projects');
    startSession();
    deliver(
      new Response(JSON.stringify({ error: 'Sign in to continue' }), {
        status: 401,
        headers: { 'x-cognexus-session': 'expired' },
      }),
    );
    await assert.rejects(previous, /discarded/);
    assert.equal(ended, 1);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Current password is incorrect' }), { status: 401 });
    await assert.rejects(api('/account/password'), /incorrect/);
    assert.equal(ended, 1);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Sign in to continue' }), {
        status: 401,
        headers: { 'x-cognexus-session': 'expired' },
      });
    await assert.rejects(api('/projects'), /Sign in/);
    assert.equal(ended, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
