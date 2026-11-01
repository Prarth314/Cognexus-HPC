import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { openDatabase, type Database } from '../server/db.js';
import { createRunner, runComputation } from '../server/runner.js';
import type { Storage } from '../server/storage.js';

let service: Awaited<ReturnType<typeof buildApp>>, directory: string, projectId: string;
let headers: Record<string, string>;
const errors: unknown[] = [];
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'cognexus-recovery-'));
  const config = readConfig({ DATA_DIR: directory, DATABASE_URL: process.env.TEST_DATABASE_URL });
  service = await buildApp({
    config,
    db: await openDatabase(config, true),
    worker: false,
    logger: false,
  });
  const registered = await service.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { 'x-cognexus-request': '1' },
    payload: {
      name: 'Recovery fixture',
      email: 'recovery-fixture@example.test',
      password: randomUUID(),
    },
  });
  assert.equal(registered.statusCode, 201, registered.body);
  headers = {
    'x-cognexus-request': '1',
    cookie: registered.headers['set-cookie']!.toString().split(';')[0],
  };
  const project = await service.app.inject({
    method: 'POST',
    url: '/api/projects',
    headers,
    payload: { name: 'Recovery fixture' },
  });
  assert.equal(project.statusCode, 201, project.body);
  projectId = project.json().id;
});
after(async () => {
  await service?.app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function submit(key = randomUUID()) {
  const response = await service.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/runs`,
    headers: { ...headers, 'idempotency-key': key },
    payload: { workflow: 'monte-carlo-pi', parameters: { samples: 1000, seed: 42 } },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().id as string;
}
async function row(id: string) {
  return (await service.app.inject({ url: `/api/runs/${id}`, headers })).json();
}
async function artifactCount(id: string) {
  return (
    await service.db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM files WHERE source_run_id=$1',
      [id],
    )
  )[0].count;
}
function runner(
  storage: Storage = service.storage,
  db: Database = service.db,
  compute = runComputation,
) {
  return createRunner(
    db,
    storage,
    { error: (e) => errors.push(e) },
    { automaticPolling: false, compute },
  );
}
async function execute(instance: ReturnType<typeof runner>) {
  try {
    await instance.tick();
  } finally {
    await instance.stop();
  }
}
test('actual worker exit and deadline fail without waiting for the production timeout', async () => {
  await assert.rejects(
    runComputation('monte-carlo-pi', { samples: 1000, seed: 1 }, '', undefined, {
      workerUrl: new URL('./fixtures/exit-worker.mjs', import.meta.url),
    }),
    /Worker exited.*7/,
  );
  await assert.rejects(
    runComputation('monte-carlo-pi', { samples: 2000000, seed: 1 }, '', undefined, {
      timeoutMs: 1,
    }),
    /time limit/,
  );
  await assert.rejects(
    runComputation('monte-carlo-pi', {}, '', undefined, { timeoutMs: 30001 }),
    /Invalid execution timeout/,
  );
});
test('the fixed worker heap limit terminates a memory-exhaustion fixture', async () => {
  await assert.rejects(
    runComputation('monte-carlo-pi', {}, '', undefined, {
      workerUrl: new URL('./fixtures/memory-worker.mjs', import.meta.url),
    }),
    /memory limit|out of memory/i,
  );
});
test('partial output-store failure is terminal and removes only the attempted artifact', async () => {
  const id = await submit();
  let attempted = '';
  const faulty: Storage = {
    ...service.storage,
    async put(key, bytes) {
      attempted = key;
      await service.storage.put(key, bytes);
      throw new Error('synthetic storage failure');
    },
  };
  await execute(runner(faulty));
  assert.equal((await row(id)).status, 'failed');
  assert.equal((await row(id)).result, null);
  assert.equal(await artifactCount(id), 0);
  assert.ok(attempted);
  await assert.rejects(service.storage.get(attempted));
});
test('worker death publishes no partial success and terminal failures do not automatically retry', async () => {
  const id = await submit();
  await execute(
    runner(service.storage, service.db, (...args) =>
      runComputation(args[0], args[1], args[2], args[3], {
        workerUrl: new URL('./fixtures/exit-worker.mjs', import.meta.url),
      }),
    ),
  );
  await execute(runner());
  assert.equal((await row(id)).status, 'failed');
  assert.equal((await row(id)).attempt, 1);
  assert.equal(await artifactCount(id), 0);
});
test('graceful worker stop aborts an active computation and leaves a terminal failed run', async () => {
  const id = await submit();
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const instance = runner(
    service.storage,
    service.db,
    async (_workflow, _parameters, _input, signal) => {
      entered();
      return new Promise((_resolve, reject) =>
        signal!.addEventListener('abort', () => reject(new Error('Execution cancelled')), {
          once: true,
        }),
      );
    },
  );
  const pending = instance.tick();
  await started;
  await instance.stop();
  await pending;
  assert.equal((await row(id)).status, 'failed');
  assert.equal((await row(id)).error, 'Execution cancelled');
  assert.equal(await artifactCount(id), 0);
});
test('completion transaction failure rolls back success and removes the private output', async () => {
  const id = await submit();
  const faulty: Database = {
    ...service.db,
    transaction: (fn) =>
      service.db.transaction((tx) =>
        fn({
          ...tx,
          query: (sql, params) => {
            if (sql.includes('INSERT INTO files')) throw new Error('synthetic database failure');
            return tx.query(sql, params);
          },
        }),
      ),
  };
  const before = [];
  for await (const object of service.storage.objects()) before.push(object.key);
  await execute(runner(service.storage, faulty));
  assert.equal((await row(id)).status, 'failed');
  assert.equal((await row(id)).result, null);
  assert.equal(await artifactCount(id), 0);
  const after = [];
  for await (const object of service.storage.objects()) after.push(object.key);
  assert.deepEqual(after.sort(), before.sort());
});
test('lost commit acknowledgment preserves a committed successful artifact', async () => {
  const id = await submit();
  const ambiguous: Database = {
    ...service.db,
    async transaction(fn) {
      let publication = false;
      const result = await service.db.transaction((tx) =>
        fn({
          ...tx,
          async query(sql, params) {
            if (sql.includes('INSERT INTO files')) publication = true;
            return tx.query(sql, params);
          },
        }),
      );
      if (publication) throw new Error('synthetic lost commit acknowledgment');
      return result;
    },
  };
  await execute(runner(service.storage, ambiguous));
  assert.equal((await row(id)).status, 'succeeded');
  const [file] = await service.db.query<{ id: string }>(
    'SELECT id FROM files WHERE source_run_id=$1',
    [id],
  );
  const response = await service.app.inject({ url: `/api/files/${file.id}/download`, headers });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().samples, 1000);
});
test('cancellation during output storage fences completion and repeated cancellation is safe', async () => {
  const id = await submit();
  const faulty: Storage = {
    ...service.storage,
    async put(key, bytes) {
      await service.storage.put(key, bytes);
      for (let i = 0; i < 2; i++) {
        const cancelled = await service.app.inject({
          method: 'POST',
          url: `/api/runs/${id}/cancel`,
          headers,
        });
        assert.equal(cancelled.statusCode, 200, cancelled.body);
      }
    },
  };
  await execute(runner(faulty));
  assert.equal((await row(id)).status, 'cancelled');
  assert.equal((await row(id)).result, null);
  assert.equal(await artifactCount(id), 0);
});
test('an expired old attempt cannot publish after a replacement attempt succeeds', async () => {
  const id = await submit();
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = runner(service.storage, service.db, async () => {
    entered();
    await gate;
    return { samples: 999 };
  });
  const pending = first.tick();
  await started;
  await service.db.query("UPDATE runs SET lease_until=now()-interval '1 second' WHERE id=$1", [id]);
  try {
    await execute(runner());
  } finally {
    release();
    await pending;
    await first.stop();
  }
  const result = await row(id);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.attempt, 2);
  assert.equal(result.result.samples, 1000);
  assert.equal(await artifactCount(id), 1);
  assert.equal(
    (
      await service.db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM audit_events WHERE action='run.completed' AND details->>'runId'=$1",
        [id],
      )
    )[0].count,
    1,
  );
});
test('database outage while claiming does not execute work; a subsequent poll recovers', async () => {
  const id = await submit();
  const outage: Database = {
    ...service.db,
    async query() {
      throw new Error('synthetic database outage');
    },
  };
  await execute(runner(service.storage, outage));
  assert.equal((await row(id)).status, 'queued');
  await execute(runner());
  assert.equal((await row(id)).status, 'succeeded');
});
test('parallel submissions enforce quota atomically and duplicate requests share one logical run', async () => {
  const key = randomUUID();
  const send = (idempotency: string) =>
    service.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/runs`,
      headers: { ...headers, 'idempotency-key': idempotency },
      payload: { workflow: 'monte-carlo-pi', parameters: { samples: 1000, seed: 42 } },
    });
  const duplicate = await Promise.all([send(key), send(key)]);
  assert.deepEqual(duplicate.map((response) => response.statusCode).sort(), [200, 201]);
  assert.equal(duplicate[0].json().id, duplicate[1].json().id);
  const concurrent = await Promise.all(Array.from({ length: 5 }, () => send(randomUUID())));
  assert.equal(concurrent.filter((response) => response.statusCode === 201).length, 2);
  assert.equal(concurrent.filter((response) => response.statusCode === 429).length, 3);
  const ids = [
    duplicate[0].json().id,
    ...concurrent.filter((r) => r.statusCode === 201).map((r) => r.json().id),
  ];
  for (const id of ids)
    await service.app.inject({ method: 'POST', url: `/api/runs/${id}/cancel`, headers });
});
