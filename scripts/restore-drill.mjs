// Real compiled servers, synthetic accounts, offline backups, new restore targets only.
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { startServer, client, sha256 } from './lib/pilot-runtime.mjs';
import { snapshot, restore } from './lib/offline-snapshot.mjs';
const root = await mkdtemp(path.join(os.tmpdir(), 'cognexus-restore-drill-'));
const source = path.join(root, 'source'),
  backup = path.join(root, 'backup'),
  target = path.join(root, 'restored');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const container = process.env.PILOT_POSTGRES_CONTAINER;
const pgBin = process.env.PILOT_POSTGRES_BIN;
const postgresDrill = !!(container || pgBin);
let admin,
  databaseUrl = '',
  restoredDatabaseUrl = '',
  server;
const created = [];
const started = performance.now();
try {
  if (postgresDrill) {
    if (container)
      assert.match(
        container,
        /^[a-f0-9]{12,64}$/,
        'Only an explicit disposable CI container is accepted',
      );
    const url = new URL(process.env.PILOT_POSTGRES_ADMIN_URL);
    assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Drill PostgreSQL must be local');
    admin = new pg.Pool({ connectionString: url.toString() });
    for (const suffix of ['source', 'restored']) {
      const name = 'cognexus_drill_' + randomUUID().replaceAll('-', '') + '_' + suffix;
      assert.match(name, /^cognexus_drill_[a-f0-9]{32}_(source|restored)$/);
      await admin.query(`CREATE DATABASE "${name}"`);
      created.push(name);
      url.pathname = '/' + name;
      if (suffix === 'source') databaseUrl = url.toString();
      else restoredDatabaseUrl = url.toString();
    }
  }
  server = await startServer(source, databaseUrl, false);
  let owner = client(server),
    teammate = client(server),
    outsider = client(server);
  await owner.register('Synthetic owner');
  const colleague = await teammate.register('Synthetic teammate');
  await outsider.register('Synthetic outsider');
  const project = await owner.json('/projects', { name: 'Disposable restored investigation' });
  const invite = await owner.json(`/projects/${project.id}/invitations`, {
    email: colleague.user.email,
    role: 'collaborator',
  });
  await teammate.json('/invitations/accept', { token: invite.token });
  const csv = 'value,label\n1,a\n2,b\n3,c\n4,d\n';
  const form = new FormData();
  form.set('file', new Blob([csv], { type: 'text/csv' }), 'fixture.csv');
  const file = await owner.json(`/projects/${project.id}/files`, form);
  assert.equal(file.sha256, sha256(csv));
  assert.deepEqual((await owner.json(`/files/${file.id}/preview`)).headers, ['value', 'label']);
  const run = await owner.json(
    `/projects/${project.id}/runs`,
    { workflow: 'csv-summary', inputFileId: file.id, parameters: { column: 'value' } },
    { 'idempotency-key': randomUUID() },
  );
  assert.equal((await owner.json(`/runs/${run.id}`)).status, 'queued');
  const cookies = [owner.cookie, teammate.cookie, outsider.cookie];
  await server.stop();
  server = undefined;
  // New process reopens the persistent queue and private inputs, then executes the queued job.
  server = await startServer(source, databaseUrl);
  [owner, teammate, outsider] = cookies.map((cookie) => client(server, cookie));
  assert.equal((await owner.completed(run.id)).result.mean, 2.5);
  const handover = await owner.json(`/projects/${project.id}/handovers`, {
    sourceRunId: run.id,
    title: 'Restorable investigation',
    tolerance: { absolute: 0, relative: 0 },
  });
  const verification = await teammate.json(
    `/handovers/${handover.id}/verify`,
    {},
    { 'idempotency-key': randomUUID() },
  );
  await teammate.completed(verification.runId);
  const before = await owner.json(`/handovers/${handover.id}`);
  assert.equal(before.verifications[0].status, 'matched');
  assert.equal(before.verifications[0].independent, true);
  const manifest = await owner.json(`/runs/${run.id}/manifest`);
  assert.equal(manifest.execution.input.sha256, sha256(csv));
  assert.match(manifest.execution.engineSha256, /^[a-f0-9]{64}$/);
  await server.stop();
  server = undefined;
  let dump;
  if (postgresDrill) {
    // Both database and artifact writers are stopped. Official PG17 tools run inside CI's PG17 container.
    const url = new URL(databaseUrl);
    dump = container
      ? execFileSync(
          'docker',
          ['exec', container, 'pg_dump', '-U', url.username, '-d', created[0], '-Fc'],
          { maxBuffer: 64 * 1024 * 1024 },
        )
      : execFileSync(
          path.join(pgBin, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump'),
          ['-h', url.hostname, '-p', url.port, '-U', url.username, '-d', created[0], '-Fc'],
          {
            env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
            maxBuffer: 64 * 1024 * 1024,
          },
        );
  }
  const backupStart = performance.now();
  const copied = await snapshot(source, backup, revision);
  await restore(backup, target);
  await assert.rejects(restore(backup, target), /EEXIST/);
  if (postgresDrill) {
    const url = new URL(databaseUrl);
    if (container)
      execFileSync(
        'docker',
        [
          'exec',
          '-i',
          container,
          'pg_restore',
          '-U',
          url.username,
          '-d',
          created[1],
          '--exit-on-error',
          '--no-owner',
        ],
        { input: dump, maxBuffer: 1024 * 1024 },
      );
    else
      execFileSync(
        path.join(pgBin, process.platform === 'win32' ? 'pg_restore.exe' : 'pg_restore'),
        [
          '-h',
          url.hostname,
          '-p',
          url.port,
          '-U',
          url.username,
          '-d',
          created[1],
          '--exit-on-error',
          '--no-owner',
        ],
        {
          env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
          input: dump,
          maxBuffer: 1024 * 1024,
        },
      );
  }
  const restoreMilliseconds = performance.now() - backupStart;
  server = await startServer(target, restoredDatabaseUrl);
  [owner, teammate, outsider] = cookies.map((cookie) => client(server, cookie));
  assert.ok((await owner.json('/projects')).some((p) => p.id === project.id));
  assert.equal((await owner.request(`/files/${file.id}/download`)).status, 200);
  assert.equal(await (await teammate.request(`/files/${file.id}/download`)).text(), csv);
  assert.equal((await outsider.request(`/files/${file.id}/download`)).status, 404);
  assert.equal((await outsider.request(`/runs/${run.id}/manifest`)).status, 404);
  assert.deepEqual(await owner.json(`/runs/${run.id}/manifest`), manifest);
  const report = await teammate.json(`/handovers/${handover.id}/report`);
  assert.equal(report.checks[0].status, 'matched');
  assert.equal(report.checks[0].independent, true);
  for (const artifact of manifest.artifacts) {
    const response = await owner.request(`/files/${artifact.id}/download`);
    assert.equal(response.status, 200);
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), artifact.sha256);
  }
  // Safe local alert condition: damage only this disposable restored copy, then recover its bytes.
  const object = path.join(target, 'objects', file.id),
    original = await readFile(object);
  await rm(object);
  const missing = await owner.request(`/files/${file.id}/download`);
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).error, /restore the matching backup/);
  await writeFile(object, original, { flag: 'wx', mode: 0o600 });
  assert.equal((await owner.request(`/files/${file.id}/download`)).status, 200);
  const metrics = await fetch(server.url + '/api/metrics', {
    headers: { authorization: 'Bearer synthetic-pilot-operations-token-32-chars' },
  });
  assert.match(await metrics.text(), /status="503"/);
  await server.stop();
  server = undefined;
  // Inspection actually reads all restored referenced objects; no automatic repairs/deletions.
  const { readConfig } = await import('../dist-server/server/config.js');
  const { openDatabase } = await import('../dist-server/server/db.js');
  const { createStorage } = await import('../dist-server/server/storage.js');
  const { inspectStorage } = await import('../dist-server/server/maintenance.js');
  const config = readConfig({ DATA_DIR: target, DATABASE_URL: restoredDatabaseUrl });
  const db = await openDatabase(config);
  let integrity;
  try {
    integrity = await inspectStorage(db, createStorage(config), { verify: true });
  } finally {
    await db.close();
  }
  assert.equal(integrity.consistent, true);
  assert.equal(integrity.verified, 3);
  console.log(
    JSON.stringify(
      {
        revision,
        database: postgresDrill
          ? 'PostgreSQL17 pg_dump/pg_restore'
          : 'persistent PGlite offline copy',
        compiledProcessRestart: 'passed',
        multiAccountRestore: 'passed',
        verifiedArtifacts: integrity.verified,
        alertCondition:
          'local missing-object 503 recorded in protected metrics; no external delivery',
        copied,
        restoreMilliseconds: Math.round(restoreMilliseconds),
        totalMilliseconds: Math.round(performance.now() - started),
        limitation:
          'Synthetic disposable drill, not a production RTO/RPO; secrets and datasets require encrypted off-host backups.',
      },
      null,
      2,
    ),
  );
} finally {
  await server?.stop();
  if (admin) {
    for (const name of created) {
      assert.match(name, /^cognexus_drill_[a-f0-9]{32}_(source|restored)$/);
      await admin.query(`DROP DATABASE "${name}"`);
    }
    await admin.end();
  }
  const relative = path.relative(os.tmpdir(), root);
  assert.ok(relative.startsWith('cognexus-restore-drill-') && !relative.includes(path.sep));
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
