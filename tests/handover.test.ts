import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { openDatabase } from '../server/db.js';
import { createRunner } from '../server/runner.js';
import { canonical, compareResults } from '../server/handover-evidence.js';
import { digest } from '../server/security.js';

let service: Awaited<ReturnType<typeof buildApp>>,
  runner: ReturnType<typeof createRunner>,
  directory: string;
let owner: string,
  collaborator: string,
  viewer: string,
  outsider: string,
  project: string,
  source: string,
  handover: string,
  csvHandover: string;
const headers = (cookie = owner, key?: string) => ({
  'x-cognexus-request': '1',
  cookie,
  ...(key ? { 'idempotency-key': key } : {}),
});
async function request(
  method: string,
  url: string,
  payload?: unknown,
  cookie = owner,
  key?: string,
) {
  return service.app.inject({
    method: method as 'GET' | 'POST',
    url,
    headers: headers(cookie, key),
    ...(payload === undefined ? {} : { payload }),
  });
}
function upload(url: string, content: string, cookie = owner, name = 'handover.json') {
  const boundary = 'cognexus-test-' + randomUUID();
  return service.app.inject({
    method: 'POST',
    url,
    headers: { ...headers(cookie), 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--\r\n`,
    ),
  });
}
async function finish(id: string) {
  for (let i = 0; i < 15; i++) {
    await runner.tick();
    const [row] = await service.db.query<{ status: string }>(
      'SELECT status FROM runs WHERE id=$1',
      [id],
    );
    if (!['queued', 'running'].includes(row.status)) {
      assert.equal(row.status, 'succeeded');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('Run did not complete');
}
async function run(payload: unknown) {
  const response = await request(
    'POST',
    `/api/projects/${project}/runs`,
    payload,
    owner,
    randomUUID(),
  );
  assert.equal(response.statusCode, 201, response.body);
  await finish(response.json().id);
  return response.json().id as string;
}
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'cognexus-handover-'));
  const config = readConfig({ DATA_DIR: directory, DATABASE_URL: process.env.TEST_DATABASE_URL });
  service = await buildApp({
    config,
    db: await openDatabase(config, true),
    worker: false,
    logger: false,
  });
  const accounts = [];
  for (const [name, email] of [
    ['Handover author', 'handover-author@example.org'],
    ['Handover colleague', 'handover-colleague@example.org'],
    ['Handover viewer', 'handover-viewer@example.org'],
    ['Handover outsider', 'handover-outsider@example.org'],
  ]) {
    const response = await request(
      'POST',
      '/api/auth/register',
      { name, email, password: 'handover-test-password-strong' },
      '',
    );
    assert.equal(response.statusCode, 201, response.body);
    accounts.push({
      id: response.json().user.id,
      cookie: String(response.headers['set-cookie']).split(';')[0],
    });
  }
  [owner, collaborator, viewer, outsider] = accounts.map((value) => value.cookie);
  const response = await request('POST', '/api/projects', { name: 'Handover integration' });
  project = response.json().id;
  await service.db.query(
    "INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'collaborator'),($1,$3,'viewer')",
    [project, accounts[1].id, accounts[2].id],
  );
  runner = createRunner(service.db, service.storage, { error: () => {} });
  source = await run({ workflow: 'monte-carlo-pi', parameters: { samples: 1000, seed: 42 } });
});
after(async () => {
  await runner?.stop();
  await service?.app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
test('comparison uses declared tolerances, exact integer/string checks, and detects missing outputs', () => {
  assert.equal(
    compareResults({ count: 1000 }, { count: 1000.00001 }, { absolute: 0.001, relative: 0.001 })[0]
      .matches,
    false,
  );
  assert.equal(
    compareResults({ mean: 1.5 }, { mean: 1.50001 }, { absolute: 0.0001, relative: 0 })[0].matches,
    true,
  );
  assert.equal(
    compareResults({ count: 1000 }, { count: 1001 }, { absolute: 0.001, relative: 0.001 })[0]
      .matches,
    false,
  );
  assert.equal(
    compareResults({ mean: 1.5 }, { mean: 1.6 }, { absolute: 0, relative: 0 })[0].matches,
    false,
  );
  assert.equal(
    compareResults({ note: 'expected' }, { note: 'different' }, { absolute: 0, relative: 0 })[0]
      .matches,
    false,
  );
  assert.equal(compareResults({ mean: null }, {}, { absolute: 0, relative: 0 })[0].matches, false);
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
});
test('completed runs produce immutable handovers with real preflight checks and private metadata', async () => {
  const response = await request('POST', `/api/projects/${project}/handovers`, {
    title: 'Reproduce seeded evidence',
    sourceRunId: source,
    notes: 'Use the recorded seed and review limitations.',
  });
  assert.equal(response.statusCode, 201, response.body);
  handover = response.json().id;
  const detail = await request('GET', `/api/handovers/${handover}`);
  assert.equal(detail.statusCode, 200, detail.body);
  assert.equal(detail.json().preflight.ready, true);
  assert.equal(detail.json().origin, 'native');
  assert.ok(!detail.body.includes('storage_key'));
  assert.ok(!detail.body.includes('password_hash'));
  assert.equal(detail.headers['cache-control'], 'private, no-store');
  const list = await request('GET', `/api/projects/${project}/handovers`);
  assert.equal(list.json()[0].id, handover);
  const invalid = await request('POST', `/api/projects/${project}/handovers`, {
    title: 'Invalid reference',
    sourceRunId: randomUUID(),
  });
  assert.equal(invalid.statusCode, 409);
});
test('author reruns match but do not claim a different-member verification', async () => {
  const response = await request(
    'POST',
    `/api/handovers/${handover}/verify`,
    undefined,
    owner,
    randomUUID(),
  );
  assert.equal(response.statusCode, 201, response.body);
  await finish(response.json().runId);
  const detail = (await request('GET', `/api/handovers/${handover}`)).json();
  assert.equal(detail.verifications[0].status, 'matched');
  assert.equal(detail.verifications[0].independent, false);
  assert.ok(detail.verifications[0].fields.every((field: { matches: boolean }) => field.matches));
});
test('a second member verifies actual execution and repeated/concurrent submissions are idempotent', async () => {
  const key = randomUUID(),
    responses = await Promise.all([
      request('POST', `/api/handovers/${handover}/verify`, undefined, collaborator, key),
      request('POST', `/api/handovers/${handover}/verify`, undefined, collaborator, key),
    ]);
  assert.ok(
    responses.every((response) => [200, 201].includes(response.statusCode)),
    responses.map((response) => response.body).join(),
  );
  assert.equal(responses[0].json().runId, responses[1].json().runId);
  await finish(responses[0].json().runId);
  const detail = (
    await request('GET', `/api/handovers/${handover}`, undefined, collaborator)
  ).json();
  const checks = detail.verifications.filter(
    (check: { independent: boolean }) => check.independent,
  );
  assert.equal(checks.length, 1);
  assert.equal(checks[0].status, 'matched');
  const report = await request('GET', `/api/handovers/${handover}/report`);
  assert.match(String(report.headers['content-disposition']), /attachment/);
  assert.ok(report.json().checks.some((check: { independent: boolean }) => check.independent));
  assert.match(report.json().limitations, /not a separately provisioned OS/);
});
test('handover boundaries reject outsiders, viewers writing, missing CSRF and archived writes', async () => {
  for (const suffix of ['', '/export', '/report'])
    assert.equal(
      (await request('GET', `/api/handovers/${handover}${suffix}`, undefined, outsider)).statusCode,
      404,
    );
  assert.equal(
    (await request('POST', `/api/handovers/${handover}/verify`, undefined, viewer, randomUUID()))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await request(
        'POST',
        `/api/projects/${project}/handovers`,
        { title: 'Viewer', sourceRunId: source },
        viewer,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await request('GET', `/api/handovers/${handover}/report`, undefined, viewer)).statusCode,
    200,
  );
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: `/api/handovers/${handover}/verify`,
        headers: { cookie: owner, 'idempotency-key': randomUUID() },
      })
    ).statusCode,
    403,
  );
  await request('POST', `/api/projects/${project}/archive`, { archived: true });
  assert.equal(
    (await request('POST', `/api/handovers/${handover}/verify`, undefined, owner, randomUUID()))
      .statusCode,
    409,
  );
  await request('POST', `/api/projects/${project}/archive`, { archived: false });
});
test('CSV packages include checksum-verified input and import into a different project without trusting authorship', async () => {
  const uploaded = await upload(
    `/api/projects/${project}/files`,
    'value\n1\n2\n3\n4\n',
    owner,
    'observations.csv',
  );
  assert.equal(uploaded.statusCode, 201, uploaded.body);
  const sourceId = await run({
    workflow: 'csv-summary',
    inputFileId: uploaded.json().id,
    parameters: { column: 'value' },
  });
  const created = await request('POST', `/api/projects/${project}/handovers`, {
    sourceRunId: sourceId,
    title: 'Portable dataset statistics',
    tolerance: { absolute: 0.000001, relative: 0 },
  });
  assert.equal(created.statusCode, 201, created.body);
  csvHandover = created.json().id;
  const exported = await request('GET', `/api/handovers/${csvHandover}/export`);
  assert.equal(exported.statusCode, 200, exported.body);
  const bundle = exported.json();
  assert.equal(Buffer.from(bundle.input.contentBase64, 'base64').toString(), 'value\n1\n2\n3\n4\n');
  assert.ok(!exported.body.includes('storage_key'));
  assert.ok(!exported.body.includes('created_by'));
  const other = (await request('POST', '/api/projects', { name: 'Portable destination' })).json()
    .id;
  const imported = await upload(`/api/projects/${other}/handovers/import`, JSON.stringify(bundle));
  assert.equal(imported.statusCode, 201, imported.body);
  const id = imported.json().id,
    detail = (await request('GET', `/api/handovers/${id}`)).json();
  assert.equal(detail.origin, 'imported');
  assert.equal(detail.preflight.ready, true);
  const verify = await request(
    'POST',
    `/api/handovers/${id}/verify`,
    undefined,
    owner,
    randomUUID(),
  );
  assert.equal(verify.statusCode, 201, verify.body);
  await finish(verify.json().runId);
  const report = (await request('GET', `/api/handovers/${id}`)).json();
  assert.equal(report.verifications[0].status, 'matched');
  assert.equal(report.verifications[0].independent, false);
});
test('imports reject altered checksums, missing inputs, arbitrary code, and unexpected parameters', async () => {
  const bundle = (await request('GET', `/api/handovers/${csvHandover}/export`)).json();
  const altered = { ...bundle, title: 'Changed without checksum' };
  assert.equal(
    (await upload(`/api/projects/${project}/handovers/import`, JSON.stringify(altered))).statusCode,
    409,
  );
  const sign = (value: Record<string, unknown>) => {
    const { checksum: _, ...payload } = value;
    return { ...payload, checksum: digest(canonical(payload)) };
  };
  assert.equal(
    (
      await upload(
        `/api/projects/${project}/handovers/import`,
        JSON.stringify(sign({ ...bundle, input: null })),
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await upload(
        `/api/projects/${project}/handovers/import`,
        JSON.stringify(sign({ ...bundle, workflow: 'shell-script' })),
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await upload(
        `/api/projects/${project}/handovers/import`,
        JSON.stringify(sign({ ...bundle, parameters: { column: 'value', command: 'unapproved' } })),
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (await upload(`/api/projects/${project}/handovers/import`, 'not json')).statusCode,
    400,
  );
});
test('an unavailable implementation and altered input bytes block verification before creating a run', async () => {
  const original = (await request('GET', `/api/handovers/${handover}/export`)).json(),
    { checksum: _, ...payload } = original;
  payload.engineSha256 = '0'.repeat(64);
  const imported = await upload(
    `/api/projects/${project}/handovers/import`,
    JSON.stringify({ ...payload, checksum: digest(canonical(payload)) }),
  );
  assert.equal(imported.statusCode, 201, imported.body);
  const id = imported.json().id;
  assert.equal((await request('GET', `/api/handovers/${id}`)).json().preflight.ready, false);
  assert.equal(
    (await request('POST', `/api/handovers/${id}/verify`, undefined, owner, randomUUID()))
      .statusCode,
    409,
  );
  const csv = (await request('GET', `/api/handovers/${csvHandover}/export`)).json(),
    { checksum: __, ...csvPayload } = csv;
  csvPayload.input = {
    ...csvPayload.input,
    contentBase64: Buffer.from('different bytes').toString('base64'),
  };
  assert.equal(
    (
      await upload(
        `/api/projects/${project}/handovers/import`,
        JSON.stringify({ ...csvPayload, checksum: digest(canonical(csvPayload)) }),
      )
    ).statusCode,
    409,
  );
});
test('oversized portable imports fail before JSON parsing or storage writes', async () => {
  assert.equal(
    (await upload(`/api/projects/${project}/handovers/import`, ' '.repeat(3 * 1024 * 1024 + 1)))
      .statusCode,
    413,
  );
});
test('a declared reference mismatch is reported rather than promoted to a successful reproduction', async () => {
  const original = (await request('GET', `/api/handovers/${handover}/export`)).json(),
    { checksum: _, ...payload } = original;
  payload.result = { ...payload.result, estimate: 99 };
  const bundle = { ...payload, checksum: digest(canonical(payload)) };
  const imported = await upload(
    `/api/projects/${project}/handovers/import`,
    JSON.stringify(bundle),
  );
  assert.equal(imported.statusCode, 201, imported.body);
  const id = imported.json().id,
    verification = await request(
      'POST',
      `/api/handovers/${id}/verify`,
      undefined,
      collaborator,
      randomUUID(),
    );
  assert.equal(verification.statusCode, 201, verification.body);
  await finish(verification.json().runId);
  const detail = (await request('GET', `/api/handovers/${id}`)).json();
  assert.equal(detail.verifications[0].status, 'different');
  const exportedReport = (await request('GET', `/api/handovers/${id}/report`)).json();
  assert.equal(exportedReport.checks[0].status, 'different');
  assert.equal(exportedReport.checks[0].executionStatus, 'succeeded');
  assert.ok(
    detail.verifications[0].fields.some(
      (field: { path: string; matches: boolean }) => field.path === 'estimate' && !field.matches,
    ),
  );
});
test('missing reference artifacts produce actionable preflight failures and block replay/export', async () => {
  const [file] = await service.db.query<{ storage_key: string; bytes: number }>(
    'SELECT storage_key,bytes FROM files WHERE source_run_id=$1',
    [source],
  );
  const bytes = await service.storage.get(file.storage_key, file.bytes);
  await service.storage.remove(file.storage_key);
  try {
    const detail = (await request('GET', `/api/handovers/${handover}`)).json();
    assert.equal(detail.preflight.ready, false);
    assert.equal(
      detail.preflight.checks.find((check: { label: string }) => check.label === 'Reference output')
        .ok,
      false,
    );
    assert.equal(
      (await request('POST', `/api/handovers/${handover}/verify`, undefined, owner, randomUUID()))
        .statusCode,
      409,
    );
    assert.equal((await request('GET', `/api/handovers/${handover}/export`)).statusCode, 409);
  } finally {
    await service.storage.put(file.storage_key, bytes);
  }
});
test('verification shares existing queue limits and snapshot tampering fails closed', async () => {
  await runner.stop(); // Hold the queue still while asserting admission, independent of scheduler timing.
  const queued = [];
  for (let i = 0; i < 3; i++) {
    const response = await request(
      'POST',
      `/api/projects/${project}/runs`,
      { workflow: 'monte-carlo-pi', parameters: { samples: 1000, seed: i + 1 } },
      owner,
      randomUUID(),
    );
    assert.equal(response.statusCode, 201, response.body);
    queued.push(response.json().id);
  }
  assert.equal(
    (await request('POST', `/api/handovers/${handover}/verify`, undefined, owner, randomUUID()))
      .statusCode,
    429,
  );
  await service.db.query("UPDATE runs SET status='cancelled' WHERE id=ANY($1::uuid[])", [queued]);
  const [row] = await service.db.query<{ snapshot_hash: string }>(
    'SELECT snapshot_hash FROM handovers WHERE id=$1',
    [handover],
  );
  await service.db.query('UPDATE handovers SET snapshot_hash=$2 WHERE id=$1', [
    handover,
    '0'.repeat(64),
  ]);
  try {
    assert.equal((await request('GET', `/api/handovers/${handover}`)).statusCode, 409);
  } finally {
    await service.db.query('UPDATE handovers SET snapshot_hash=$2 WHERE id=$1', [
      handover,
      row.snapshot_hash,
    ]);
  }
});
