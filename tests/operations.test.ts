import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { openDatabase } from '../server/db.js';

let service: Awaited<ReturnType<typeof buildApp>>, directory: string;
const operationsToken = 'a-private-operations-token-at-least-32-characters';
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'cognexus-ops-tests-'));
  const config = readConfig({ DATA_DIR: directory, OPERATIONS_TOKEN: operationsToken });
  service = await buildApp({ config, db: await openDatabase(config, true), logger: false });
});
after(async () => {
  await service.app.close();
  await rm(directory, { recursive: true, force: true });
});
test('metrics require a configured bearer credential and do not reveal it', async () => {
  assert.equal((await service.app.inject({ url: '/api/metrics' })).statusCode, 401);
  assert.equal(
    (await service.app.inject({ url: '/api/metrics', headers: { authorization: 'Bearer wrong' } }))
      .statusCode,
    401,
  );
  const response = await service.app.inject({
    url: '/api/metrics',
    headers: { authorization: `Bearer ${operationsToken}` },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.ok(!response.body.includes(operationsToken));
  assert.match(response.headers['content-type']!, /text\/plain/);
});
test('metrics use stable route templates rather than raw record IDs or query strings', async () => {
  const identifier = '11111111-1111-4111-8111-111111111111';
  await service.app.inject({ url: `/api/runs/${identifier}?private=do-not-record` });
  const response = await service.app.inject({
    url: '/api/metrics',
    headers: { authorization: `Bearer ${operationsToken}` },
  });
  assert.ok(response.body.includes('/api/runs/:runId'));
  assert.ok(!response.body.includes(identifier));
  assert.ok(!response.body.includes('do-not-record'));
  assert.match(response.body, /cognexus_jobs\{status="queued"\} 0/);
});
test('readiness distinguishes a polling worker from a stopped worker', async () => {
  await service.runner!.tick();
  const ready = await service.app.inject({ url: '/api/ready' });
  assert.equal(ready.statusCode, 200, ready.body);
  assert.equal(ready.json().storage, 'not-probed');
  await service.runner!.stop();
  const stopped = await service.app.inject({ url: '/api/ready' });
  assert.equal(stopped.statusCode, 503);
  assert.equal(stopped.json().database, 'ok');
});
test('short operations credentials fail configuration validation', () => {
  assert.throws(() => readConfig({ OPERATIONS_TOKEN: 'weak' }), /at least 32/);
});
