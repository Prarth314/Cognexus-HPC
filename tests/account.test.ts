import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { openDatabase, migrate } from '../server/db.js';
import { randomUUID } from 'node:crypto';

let service: Awaited<ReturnType<typeof buildApp>>, directory: string;
let owner: string, other: string, secondary: string, initialCodes: string[], codes: string[];
const originalPassword = 'initial-long-account-password',
  changedPassword = 'updated-long-account-password',
  recoveredPassword = 'recovered-long-account-password';
const headers = (cookie = '') => ({ 'x-cognexus-request': '1', cookie });
function cookie(response: { headers: Record<string, unknown> }) {
  return String(response.headers['set-cookie']).split(';')[0];
}
async function login(email = 'security@example.org', password = originalPassword) {
  return service.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: headers(),
    payload: { email, password },
  });
}
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'cognexus-account-tests-'));
  const config = readConfig({ DATA_DIR: directory, DATABASE_URL: process.env.TEST_DATABASE_URL });
  service = await buildApp({
    config,
    db: await openDatabase(config, true),
    worker: false,
    logger: false,
  });
  for (const [name, email] of [
    ['Security owner', 'security@example.org'],
    ['Security outsider', 'security-outsider@example.org'],
  ]) {
    const response = await service.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: headers(),
      payload: { name, email, password: originalPassword },
    });
    assert.equal(response.statusCode, 201, response.body);
    if (email === 'security@example.org') owner = cookie(response);
    else other = cookie(response);
  }
  secondary = cookie(await login());
});
after(async () => {
  await service?.app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
test('security overview exposes session metadata but never hashes or recovery codes', async () => {
  const response = await service.app.inject({
    url: '/api/account/security',
    headers: headers(owner),
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().sessions.length, 2);
  assert.equal(response.json().sessions.filter((s: { current: boolean }) => s.current).length, 1);
  assert.equal(response.json().recoveryCodesRemaining, 0);
  assert.equal(response.json().emailVerified, false);
  assert.ok(!response.body.includes('token_hash'));
});
test('session identifiers do not let another account revoke access', async () => {
  const security = (
    await service.app.inject({ url: '/api/account/security', headers: headers(owner) })
  ).json();
  assert.equal(
    (
      await service.app.inject({
        method: 'DELETE',
        url: `/api/account/sessions/${security.sessions[0].id}`,
        headers: headers(other),
      })
    ).statusCode,
    404,
  );
});
test('profile changes persist and export excludes authentication secrets', async () => {
  const response = await service.app.inject({
    method: 'PATCH',
    url: '/api/account/profile',
    headers: headers(owner),
    payload: { name: 'Updated researcher' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.name, 'Updated researcher');
  const exported = await service.app.inject({
    url: '/api/account/export',
    headers: headers(owner),
  });
  assert.equal(exported.json().user.name, 'Updated researcher');
  assert.ok(!exported.body.includes('password_hash'));
  assert.ok(!exported.body.includes('token_hash'));
});
test('password changes require reauthentication, rotate cookies, and revoke old sessions', async () => {
  const failed = await service.app.inject({
    method: 'POST',
    url: '/api/account/password',
    headers: headers(owner),
    payload: { currentPassword: 'wrong', newPassword: changedPassword },
  });
  assert.equal(failed.statusCode, 401);
  const response = await service.app.inject({
    method: 'POST',
    url: '/api/account/password',
    headers: headers(owner),
    payload: { currentPassword: originalPassword, newPassword: changedPassword },
  });
  assert.equal(response.statusCode, 200, response.body);
  const old = owner;
  owner = cookie(response);
  assert.notEqual(old, owner);
  for (const value of [old, secondary])
    assert.equal(
      (await service.app.inject({ url: '/api/projects', headers: headers(value) })).statusCode,
      401,
    );
  assert.equal((await login()).statusCode, 401);
  assert.equal((await login('security@example.org', changedPassword)).statusCode, 200);
});
test('recovery-code creation requires current password and stores only hashes', async () => {
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: '/api/account/recovery-codes',
        headers: headers(owner),
        payload: { currentPassword: 'wrong' },
      })
    ).statusCode,
    401,
  );
  const response = await service.app.inject({
    method: 'POST',
    url: '/api/account/recovery-codes',
    headers: headers(owner),
    payload: { currentPassword: changedPassword },
  });
  assert.equal(response.statusCode, 200, response.body);
  initialCodes = response.json().codes;
  assert.equal(new Set(initialCodes).size, 8);
  assert.ok(initialCodes.every((code) => /^[a-f0-9]{32}$/.test(code)));
  const rows = await service.db.query('SELECT token_hash FROM recovery_codes');
  assert.ok(initialCodes.every((code) => !JSON.stringify(rows).includes(code)));
  const overview = await service.app.inject({
    url: '/api/account/security',
    headers: headers(owner),
  });
  assert.equal(overview.json().recoveryCodesRemaining, 8);
  assert.ok(!initialCodes.some((code) => overview.body.includes(code)));
});
test('regenerating codes invalidates the old set and unknown accounts have the same failure', async () => {
  const generated = await service.app.inject({
    method: 'POST',
    url: '/api/account/recovery-codes',
    headers: headers(owner),
    payload: { currentPassword: changedPassword },
  });
  assert.equal(generated.statusCode, 200, generated.body);
  codes = generated.json().codes;
  const attempt = await service.app.inject({
    method: 'POST',
    url: '/api/auth/recover',
    headers: headers(),
    payload: {
      email: 'security@example.org',
      code: initialCodes[0],
      newPassword: recoveredPassword,
    },
  });
  const unknown = await service.app.inject({
    method: 'POST',
    url: '/api/auth/recover',
    headers: headers(),
    payload: {
      email: 'nonexistent@example.org',
      code: initialCodes[0],
      newPassword: recoveredPassword,
    },
  });
  assert.equal(attempt.statusCode, 400);
  assert.equal(unknown.statusCode, 400);
  assert.equal(attempt.json().error, unknown.json().error);
});
test('concurrent recovery consumes a code exactly once and revokes every prior session', async () => {
  const payload = { email: 'security@example.org', code: codes[0], newPassword: recoveredPassword };
  const responses = await Promise.all(
    [1, 2].map(() =>
      service.app.inject({ method: 'POST', url: '/api/auth/recover', headers: headers(), payload }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 400]);
  assert.equal(
    (await service.app.inject({ url: '/api/projects', headers: headers(owner) })).statusCode,
    401,
  );
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: '/api/auth/recover',
        headers: headers(),
        payload,
      })
    ).statusCode,
    400,
  );
  assert.equal((await login('security@example.org', changedPassword)).statusCode, 401);
  const signedIn = await login('security@example.org', recoveredPassword);
  assert.equal(signedIn.statusCode, 200, signedIn.body);
  owner = cookie(signedIn);
  const overview = (
    await service.app.inject({ url: '/api/account/security', headers: headers(owner) })
  ).json();
  assert.equal(overview.recoveryCodesRemaining, 0);
  assert.ok(
    overview.events.some((event: { action: string }) => event.action === 'password.recovered'),
  );
});
test('revoke-other-sessions preserves this session and current session can be signed out', async () => {
  secondary = cookie(await login('security@example.org', recoveredPassword));
  const response = await service.app.inject({
    method: 'POST',
    url: '/api/account/sessions/revoke-others',
    headers: headers(owner),
    payload: { currentPassword: recoveredPassword },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(
    (await service.app.inject({ url: '/api/projects', headers: headers(secondary) })).statusCode,
    401,
  );
  const overview = (
    await service.app.inject({ url: '/api/account/security', headers: headers(owner) })
  ).json();
  assert.equal(overview.sessions.length, 1);
  assert.equal(
    (
      await service.app.inject({
        method: 'DELETE',
        url: `/api/account/sessions/${overview.sessions[0].id}`,
        headers: headers(owner),
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await service.app.inject({ url: '/api/account/security', headers: headers(owner) }))
      .statusCode,
    401,
  );
});
test('version-one database upgrades preserve existing users and sessions and rerun safely', async () => {
  const db = await openDatabase(readConfig({ DATA_DIR: directory }), true),
    id = randomUUID();
  try {
    await db.query(
      'CREATE TABLE schema_migrations(version integer PRIMARY KEY,applied_at timestamptz DEFAULT now())',
    );
    await db.query('INSERT INTO schema_migrations(version) VALUES(1)');
    await db.query(
      'CREATE TABLE users(id uuid PRIMARY KEY,email text,name text,password_hash text)',
    );
    await db.query(
      'CREATE TABLE sessions(token_hash text PRIMARY KEY,user_id uuid,expires_at timestamptz)',
    );
    await db.query('CREATE TABLE projects(id uuid PRIMARY KEY)');
    await db.query('INSERT INTO users(id,email) VALUES($1,$2)', [id, 'upgrade@example.org']);
    await db.query(
      `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('legacy-hash',$1,now()+interval '1 day')`,
      [id],
    );
    await migrate(db);
    await migrate(db);
    const [session] = await db.query<{ id: string; token_hash: string }>(
      'SELECT id,token_hash FROM sessions',
    );
    assert.ok(session.id);
    assert.equal(session.token_hash, 'legacy-hash');
    assert.equal((await db.query('SELECT id FROM users WHERE id=$1', [id])).length, 1);
  } finally {
    await db.close();
  }
});
