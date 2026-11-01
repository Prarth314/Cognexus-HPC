import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function startServer(dataDir, databaseUrl = '', worker = true) {
  const child = spawn(process.execPath, ['scripts/lib/pilot-server.mjs'], {
    env: {
      ...process.env,
      PILOT_DATA_DIR: dataDir,
      PILOT_DATABASE_URL: databaseUrl,
      PILOT_WORKER: worker ? 'enabled' : 'disabled',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '',
    errors = '';
  child.stdout.on('data', (bytes) => {
    output = (output + bytes).slice(-8000);
  });
  child.stderr.on('data', (bytes) => {
    errors = (errors + bytes).slice(-8000);
  });
  const deadline = Date.now() + 30000;
  try {
    while (!output.includes('\n')) {
      if (child.exitCode !== null || Date.now() > deadline)
        throw new Error('Disposable compiled server did not start: ' + errors);
      await wait(50);
    }
    const { url } = JSON.parse(output.split('\n')[0]);
    return {
      url,
      async stop() {
        if (child.exitCode !== null) return;
        const exited = once(child, 'exit');
        const timeout = setTimeout(() => child.kill(), 15000);
        child.send('shutdown');
        try {
          const [code, signal] = await exited;
          assert.equal(code, 0, `Disposable server failed graceful shutdown (${signal})`);
        } finally {
          clearTimeout(timeout);
        }
      },
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}
export function client(server, cookie = '') {
  return {
    cookie,
    async request(route, body, extra = {}) {
      const response = await fetch(server.url + '/api' + route, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'x-cognexus-request': '1',
          cookie: this.cookie,
          ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }),
          ...extra,
        },
        body:
          body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      const setCookie = response.headers.getSetCookie()[0];
      if (setCookie) this.cookie = setCookie.split(';')[0];
      return response;
    },
    async json(route, body, headers) {
      const response = await this.request(route, body, headers);
      assert.ok(response.ok, `${route}: ${response.status} ${await response.clone().text()}`);
      return response.json();
    },
    async register(name) {
      return this.json('/auth/register', {
        name,
        email: randomUUID() + '@example.test',
        password: randomUUID(),
      });
    },
    async completed(id, pollMilliseconds = 50) {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const run = await this.json('/runs/' + id);
        if (['succeeded', 'failed', 'cancelled'].includes(run.status)) {
          assert.equal(run.status, 'succeeded', JSON.stringify(run));
          return run;
        }
        await wait(pollMilliseconds);
      }
      throw new Error('Disposable job did not finish');
    },
  };
}
