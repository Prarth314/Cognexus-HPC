// Exercise the actual compiled package over HTTP, including its worker runtime.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'cognexus-smoke-'));
const port = process.env.SMOKE_PORT || '3199';
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['dist-server/server/index.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: port,
    PUBLIC_ORIGIN: origin,
    DATA_DIR: dataDir,
    DATABASE_URL: '',
    SIGNUP_CODE: '',
    GEMINI_API_KEY: '',
    GEMINI_MODEL: '',
    S3_BUCKET: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => {
  output = (output + chunk.toString()).slice(-8000);
});
child.stderr.on('data', (chunk) => {
  output = (output + chunk.toString()).slice(-8000);
});
let cookie = '';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(url, body, extraHeaders = {}) {
  const response = await fetch(`${origin}/api${url}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'x-cognexus-request': '1',
      'content-type': 'application/json',
      cookie,
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.ok(response.ok, `${url}: ${response.status} ${await response.clone().text()}`);
  const setCookie = response.headers.getSetCookie();
  if (setCookie[0]) cookie = setCookie[0].split(';')[0];
  return response.json();
}
try {
  const deadline = Date.now() + 20000;
  while (true) {
    if (child.exitCode !== null) throw new Error(`Compiled service exited: ${output}`);
    try {
      if ((await fetch(`${origin}/api/health`)).ok) break;
    } catch {}
    if (Date.now() > deadline) throw new Error(`Compiled service did not become ready: ${output}`);
    await wait(200);
  }
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Cognexus/);
  await request('/auth/register', {
    name: 'Compiled smoke test',
    email: `${randomUUID()}@example.test`,
    password: randomUUID(),
  });
  const project = await request('/projects', { name: 'Compiled runtime verification' });
  const run = await request(
    `/projects/${project.id}/runs`,
    { workflow: 'monte-carlo-pi', parameters: { samples: 10000, seed: 42 } },
    { 'idempotency-key': randomUUID() },
  );
  const runDeadline = Date.now() + 15000;
  let result;
  do {
    result = await request(`/runs/${run.id}`);
    if (['succeeded', 'failed', 'cancelled'].includes(result.status)) break;
    await wait(200);
  } while (Date.now() < runDeadline);
  assert.equal(result.status, 'succeeded', JSON.stringify(result));
  assert.equal(result.result.samples, 10000);
  const manifest = await request(`/runs/${run.id}/manifest`);
  assert.equal(manifest.artifacts.length, 1);
  const handover = await request(`/projects/${project.id}/handovers`, {
    sourceRunId: run.id,
    title: 'Compiled handover smoke',
    notes: 'Verify the packaged runtime.',
  });
  const verification = await request(
    `/handovers/${handover.id}/verify`,
    {},
    { 'idempotency-key': randomUUID() },
  );
  let evidence;
  const verificationDeadline = Date.now() + 15000;
  do {
    evidence = await request(`/handovers/${handover.id}`);
    if (evidence.verifications[0]?.status === 'matched') break;
    await wait(200);
  } while (Date.now() < verificationDeadline);
  assert.equal(evidence.verifications[0]?.status, 'matched', JSON.stringify(evidence));
  assert.equal(evidence.verifications[0]?.independent, false);
  const portable = await request(`/handovers/${handover.id}/export`);
  assert.equal(portable.format, 'cognexus-handover');
  console.log(
    'Compiled HTTP smoke test passed: assets → account → project → execution → artifact → handover → verified rerun → portable export.',
  );
} finally {
  const exited = new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', resolve);
  });
  child.kill('SIGTERM');
  await exited;
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
