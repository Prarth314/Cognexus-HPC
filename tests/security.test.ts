import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, scryptSync } from 'node:crypto';
import { Writable } from 'node:stream';
import { buildApp } from '../server/app.js';
import { openDatabase } from '../server/db.js';
import { readConfig } from '../server/config.js';
import {
  hashPassword,
  verifyPassword,
  needsPasswordUpgrade,
  digest,
  permitsOrigin,
} from '../server/security.js';
import { issueEnrollment, approveExistingAccount } from '../server/enrollment.js';
import { createStorage } from '../server/storage.js';
import { createAdmission } from '../server/admission.js';
import { runComputation } from '../server/runner.js';

let service: Awaited<ReturnType<typeof buildApp>>,
  directory: string,
  logs = '';
let owner: string, recipient: string, ownerId: string, recipientId: string, projectId: string;
const password = 'security-fixture-long-password';
const headers = (cookie = '') => ({ 'x-cognexus-request': '1', cookie });
const cookie = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0];
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'cognexus-security-'));
  const config = readConfig({ DATA_DIR: directory, DATABASE_URL: process.env.TEST_DATABASE_URL });
  service = await buildApp({
    config,
    db: await openDatabase(config, true),
    worker: false,
    logStream: new Writable({
      write(chunk, _encoding, callback) {
        logs += chunk.toString();
        callback();
      },
    }),
  });
  for (const [name, email] of [
    ['Security audit owner', 'audit-owner@example.org'],
    ['Security audit recipient', 'audit-recipient@example.org'],
  ]) {
    const response = await service.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: headers(),
      payload: { name, email, password },
    });
    assert.equal(response.statusCode, 201, response.body);
    if (email === 'audit-owner@example.org') {
      owner = cookie(response);
      ownerId = response.json().user.id;
    } else {
      recipient = cookie(response);
      recipientId = response.json().user.id;
    }
  }
  const response = await service.app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: headers(owner),
    payload: { name: 'Security audit project' },
  });
  assert.equal(response.statusCode, 201, response.body);
  projectId = response.json().id;
});
after(async () => {
  await service?.app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('scrypt v2 verifies safely and retains upgrade support for valid legacy hashes', async () => {
  const current = await hashPassword(password);
  assert.match(current, /^scrypt-v2:/);
  assert.equal(await verifyPassword(password, current), true);
  assert.equal(await verifyPassword('incorrect', current), false);
  const salt = 'a'.repeat(32),
    legacy = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  assert.equal(await verifyPassword(password, legacy), true);
  assert.equal(needsPasswordUpgrade(legacy), true);
  assert.equal(needsPasswordUpgrade(current), false);
  assert.equal(await verifyPassword(password, 'scrypt:broken:00'), false);
  assert.equal(await verifyPassword(password, current + ':extra'), false);
});
test('password hashing rejects work beyond its bounded active and waiting capacity', async () => {
  const results = await Promise.allSettled(Array.from({ length: 7 }, () => hashPassword(password)));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 6);
  const rejected = results.filter((result) => result.status === 'rejected');
  assert.equal(rejected.length, 1);
  assert.match(String((rejected[0] as PromiseRejectedResult).reason), /Authentication is busy/);
});
test('production PostgreSQL rejects a bootstrap role and accepts a restricted application role', async (context) => {
  if (!process.env.TEST_DATABASE_URL) {
    context.skip('PostgreSQL CI runs this privilege boundary test');
    return;
  }
  const [privileges] = await service.db.query<{
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
  }>(
    'SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname=current_user',
  );
  if (Object.values(privileges).some(Boolean))
    await assert.rejects(
      openDatabase({
        databaseUrl: process.env.TEST_DATABASE_URL,
        dataDir: directory,
        production: true,
      }),
      /must not have/,
    );
  if (!privileges.rolcreaterole && !privileges.rolsuper) {
    context.skip('Test database does not permit temporary role creation');
    return;
  }
  const role = 'cognexus_audit_' + randomUUID().replaceAll('-', ''),
    secret = randomUUID();
  const [{ sql }] = await service.db.query<{ sql: string }>(
    "SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',$1::text,$2::text) AS sql",
    [role, secret],
  );
  await service.db.query(sql);
  try {
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.username = role;
    url.password = secret;
    const restricted = await openDatabase({
      databaseUrl: url.toString(),
      dataDir: directory,
      production: true,
    });
    try {
      assert.equal((await restricted.query('SELECT 1')).length, 1);
    } finally {
      await restricted.close();
    }
  } finally {
    await service.db.query(`DROP ROLE ${role}`);
  }
});
test('local origin aliases work only for the configured loopback port and production stays exact', () => {
  assert.equal(permitsOrigin('http://127.0.0.1:3000', 'http://localhost:3000', false), true);
  assert.equal(permitsOrigin('http://127.0.0.1:3001', 'http://localhost:3000', false), false);
  assert.equal(
    permitsOrigin('http://localhost.evil.example:3000', 'http://localhost:3000', false),
    false,
  );
  assert.equal(permitsOrigin('http://127.0.0.1:3000', 'http://localhost:3000', true), false);
  assert.equal(
    permitsOrigin('https://research.example.org', 'https://research.example.org', true),
    true,
  );
});
test('admission refuses overflow and releases a slot only once', () => {
  const acquire = createAdmission(1),
    release = acquire();
  assert.throws(acquire, /capacity/);
  release();
  release();
  const next = acquire();
  assert.throws(acquire, /capacity/);
  next();
});
test('canonical and encoded API paths never bypass authentication or request verification', async () => {
  for (const url of ['/api/projects', '/api/%70rojects', '/%61pi/projects', '/api//projects']) {
    const response = await service.app.inject({
      method: 'POST',
      url,
      headers: { cookie: owner },
      payload: { name: 'No verification' },
    });
    assert.ok([400, 403, 404].includes(response.statusCode), `${url}: ${response.statusCode}`);
  }
  const response = await service.app.inject({ url: '/api/projects', headers: headers(owner) });
  assert.equal(response.headers['cache-control'], 'private, no-store');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.match(String(response.headers['content-security-policy']), /frame-ancestors 'none'/);
});
test('production enrollment is email-bound, expiring, hashed, single use, and fails closed for existing identities', async () => {
  const config = readConfig({
    NODE_ENV: 'production',
    PUBLIC_ORIGIN: 'https://audit.example.org',
    DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://unused.invalid/audit',
    DATA_DIR: directory,
  });
  // Inject a dedicated in-memory database when PostgreSQL CI is not available.
  const db = await openDatabase(
    { dataDir: directory, databaseUrl: process.env.TEST_DATABASE_URL },
    true,
  );
  const production = await buildApp({ config, db, worker: false, logger: false });
  try {
    const email = 'production-enrollment@example.org',
      issued = await issueEnrollment(db, email);
    const [stored] = await db.query<{ token_hash: string }>(
      'SELECT token_hash FROM enrollment_tokens WHERE email=$1',
      [email],
    );
    assert.equal(stored.token_hash, digest(issued.code));
    const register = (address: string, code: string) =>
      production.app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: headers(),
        payload: { name: 'Approved researcher', email: address, password, signupCode: code },
      });
    assert.equal((await register('wrong-recipient@example.org', issued.code)).statusCode, 403);
    const success = await register(email, issued.code);
    assert.equal(success.statusCode, 201, success.body);
    assert.match(String(success.headers['set-cookie']), /__Host-cognexus=.*Secure/);
    assert.equal((await register(email, issued.code)).statusCode, 403);
    const expired = await issueEnrollment(db, 'expired-enrollment@example.org');
    await db.query(
      "UPDATE enrollment_tokens SET expires_at=now()-interval '1 second' WHERE email=$1",
      [expired.email],
    );
    assert.equal((await register(expired.email, expired.code)).statusCode, 403);
    const user = success.json().user;
    await db.query('UPDATE users SET access_approved_at=NULL WHERE id=$1', [user.id]);
    assert.equal(
      (await production.app.inject({ url: '/api/projects', headers: headers(cookie(success)) }))
        .statusCode,
      401,
    );
    const login = () =>
      production.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: headers(),
        payload: { email, password },
      });
    assert.equal((await login()).statusCode, 403);
    await approveExistingAccount(db, email);
    assert.equal((await login()).statusCode, 200);
  } finally {
    await production.app.close();
  }
});
test('owners can inspect and revoke pending invitations without exposing token hashes', async () => {
  const response = await service.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/invitations`,
    headers: headers(owner),
    payload: { email: 'audit-recipient@example.org', role: 'viewer' },
  });
  assert.equal(response.statusCode, 200, response.body);
  const list = await service.app.inject({
    url: `/api/projects/${projectId}/invitations`,
    headers: headers(owner),
  });
  assert.equal(list.json().length, 1);
  assert.ok(!list.body.includes('token_hash'));
  assert.ok(!list.body.includes(response.json().token));
  assert.equal(
    (
      await service.app.inject({
        method: 'DELETE',
        url: `/api/projects/${projectId}/invitations/${list.json()[0].id}`,
        headers: headers(recipient),
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await service.app.inject({
        method: 'DELETE',
        url: `/api/projects/${projectId}/invitations/${list.json()[0].id}`,
        headers: headers(owner),
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: '/api/invitations/accept',
        headers: headers(recipient),
        payload: { token: response.json().token },
      })
    ).statusCode,
    404,
  );
});
test('issuer demotion and recipient removal invalidate outstanding invitations', async () => {
  await service.db.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'owner')", [
    projectId,
    recipientId,
  ]);
  const invite = await service.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/invitations`,
    headers: headers(recipient),
    payload: { email: 'audit-owner@example.org', role: 'viewer' },
  });
  const change = await service.app.inject({
    method: 'PATCH',
    url: `/api/projects/${projectId}/members/${recipientId}`,
    headers: headers(owner),
    payload: { role: 'collaborator' },
  });
  assert.equal(change.statusCode, 200, change.body);
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: '/api/invitations/accept',
        headers: headers(owner),
        payload: { token: invite.json().token },
      })
    ).statusCode,
    404,
  );
  const pending = await service.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/invitations`,
    headers: headers(owner),
    payload: { email: 'audit-recipient@example.org', role: 'viewer' },
  });
  assert.equal(
    (
      await service.app.inject({
        method: 'DELETE',
        url: `/api/projects/${projectId}/members/${recipientId}`,
        headers: headers(owner),
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: '/api/invitations/accept',
        headers: headers(recipient),
        payload: { token: pending.json().token },
      })
    ).statusCode,
    404,
  );
});
test('bounded storage rejects oversized objects and traversal keys', async () => {
  const storage = createStorage(readConfig({ DATA_DIR: directory })),
    id = randomUUID();
  await storage.put(id, Buffer.from('synthetic-object'));
  assert.equal((await storage.get(id, 16)).toString(), 'synthetic-object');
  await assert.rejects(storage.get(id, 2), /allowed size/);
  await assert.rejects(storage.get('../private'), /identifier/);
});
test('storage refuses a symbolic-link object when the host permits symlink creation', async (context) => {
  const id = randomUUID(),
    outside = path.join(directory, 'synthetic-outside');
  await writeFile(outside, 'private-fixture');
  try {
    await symlink(outside, path.join(directory, 'objects', id));
  } catch (error) {
    if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code || '')) {
      context.skip('Host does not grant symlink creation; Linux CI verifies this boundary');
      return;
    }
    throw error;
  }
  await assert.rejects(
    createStorage(readConfig({ DATA_DIR: directory })).get(id),
    /Unsafe artifact/,
  );
});
test('configuration refuses public storage roots and plaintext production object endpoints', () => {
  for (const DATA_DIR of ['public', 'public/private', 'dist/private'])
    assert.throws(() => readConfig({ DATA_DIR }), /private directory/);
  assert.throws(
    () => readConfig({ PUBLIC_ORIGIN: 'https://user:password@example.org' }),
    /bare HTTP/,
  );
  assert.throws(
    () =>
      readConfig({
        NODE_ENV: 'production',
        PUBLIC_ORIGIN: 'https://audit.example.org',
        DATABASE_URL: 'postgresql://unused.invalid/test',
        S3_BUCKET: 'private',
        S3_REGION: 'test',
        S3_ENDPOINT: 'http://object-store.invalid',
      }),
    /HTTPS/,
  );
});
test('CSV previews bound columns, record output, and hide malformed input in API errors', async () => {
  const preview = await runComputation('csv-preview', {}, `value\n${'x'.repeat(1000)}\n`);
  assert.equal((preview.rows as string[][])[0][0].length, 512);
  await assert.rejects(
    runComputation('csv-preview', {}, Array.from({ length: 65 }, (_, i) => `c${i}`).join(',')),
    /64 columns/,
  );
  await assert.rejects(
    runComputation('csv-preview', {}, 'a,b\nprivate-fixture,2,3'),
    (error) =>
      error instanceof Error && error.message === 'CSV input is malformed or exceeds parser limits',
  );
});
test('structured request logs exclude raw query strings, cookies, bodies, and arbitrary error text', async () => {
  const marker = 'synthetic-sensitive-log-marker';
  await service.app.inject({
    url: `/api/projects?secret=${marker}`,
    headers: { cookie: owner, authorization: marker },
  });
  const failing = await service.app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: headers(owner),
    payload: { name: 'a', description: marker },
  });
  assert.equal(failing.statusCode, 400);
  const id = randomUUID(),
    get = service.storage.get;
  await service.db.query(
    'INSERT INTO files(id,project_id,name,storage_key,bytes,sha256,media_type,created_by) VALUES($1,$2,$3,$4,1,$5,$6,$7)',
    [id, projectId, 'synthetic.txt', id, digest('x'), 'text/plain', ownerId],
  );
  try {
    service.storage.get = async () => {
      throw new Error(marker);
    };
    const response = await service.app.inject({
      url: `/api/files/${id}/download`,
      headers: headers(owner),
    });
    assert.equal(response.statusCode, 500);
    assert.ok(!response.body.includes(marker));
  } finally {
    service.storage.get = get;
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(logs.includes('Request completed'));
  assert.ok(!logs.includes(marker));
  assert.ok(!logs.includes(owner.split('=')[1]));
});
test('session creation caps retained sessions and upgrades old password hashes after valid login', async () => {
  const salt = 'b'.repeat(32),
    legacy = `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  await service.db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [ownerId, legacy]);
  for (let i = 0; i < 12; i++)
    await service.db.query(
      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",
      [ownerId, digest(randomUUID())],
    );
  const response = await service.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: headers(),
    payload: { email: 'audit-owner@example.org', password },
  });
  assert.equal(response.statusCode, 200, response.body);
  const [{ count }] = await service.db.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM sessions WHERE user_id=$1',
    [ownerId],
  );
  assert.equal(count, 10);
  const [account] = await service.db.query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id=$1',
    [ownerId],
  );
  assert.equal(needsPasswordUpgrade(account.password_hash), false);
});
