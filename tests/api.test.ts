import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { openDatabase } from '../server/db.js';
import { createRunner } from '../server/runner.js';

let service: Awaited<ReturnType<typeof buildApp>>;
let directory: string;
let ownerCookie: string, outsiderCookie: string, viewerCookie: string;
let projectId: string, fileId: string, runId: string;
const verification = { 'x-cognexus-request': '1' };
function headers(cookie: string) {
  return { ...verification, cookie };
}
async function register(name: string, email: string) {
  const response = await service.app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: verification,
    payload: { name, email, password: 'a-strong-test-password' },
  });
  assert.equal(response.statusCode, 201, response.body);
  return {
    cookie: response.headers['set-cookie']!.toString().split(';')[0],
    user: response.json().user as { id: string },
  };
}
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'cognexus-tests-'));
  const config = readConfig({ DATA_DIR: directory, DATABASE_URL: process.env.TEST_DATABASE_URL });
  const db = await openDatabase(config, true);
  service = await buildApp({ config, db, worker: false, logger: false });
  ownerCookie = (await register('Owner', 'owner@example.org')).cookie;
  outsiderCookie = (await register('Outsider', 'outsider@example.org')).cookie;
  viewerCookie = (await register('Viewer', 'viewer@example.org')).cookie;
});
after(async () => {
  await service?.app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('authentication rejects forged sessions and login failures; session cookies are HttpOnly', async () => {
  assert.equal((await service.app.inject({ url: '/api/projects' })).statusCode, 401);
  assert.equal(
    (await service.app.inject({ url: '/api/projects', headers: { cookie: 'cognexus=forged' } }))
      .statusCode,
    401,
  );
  const login = await service.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: verification,
    payload: { email: 'owner@example.org', password: 'wrong' },
  });
  assert.equal(login.statusCode, 401);
  const success = await service.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: verification,
    payload: { email: 'owner@example.org', password: 'a-strong-test-password' },
  });
  assert.match(success.headers['set-cookie']!.toString(), /HttpOnly/);
  const sessions = await service.db.query<{ token_hash: string }>(
    'SELECT token_hash FROM sessions',
  );
  assert.ok(sessions.every((s) => !ownerCookie.includes(s.token_hash)));
});
test('mutations reject missing CSRF header and foreign origins', async () => {
  const payload = { name: 'Forbidden project' };
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: ownerCookie },
        payload,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { ...headers(ownerCookie), origin: 'https://evil.example' },
        payload,
      })
    ).statusCode,
    403,
  );
});
test('projects persist in the database and are isolated from nonmembers', async () => {
  const response = await service.app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: headers(ownerCookie),
    payload: {
      name: 'Reference research',
      description: 'Actual execution tests',
      domain: 'Statistics',
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  projectId = response.json().id;
  const list = await service.app.inject({ url: '/api/projects', headers: headers(ownerCookie) });
  assert.equal(list.json()[0].id, projectId);
  for (const resource of ['files', 'runs', 'members', 'audit']) {
    assert.equal(
      (
        await service.app.inject({
          url: `/api/projects/${projectId}/${resource}`,
          headers: headers(outsiderCookie),
        })
      ).statusCode,
      404,
    );
  }
});
test('invitations bind email, expire, cannot be reused, and enforce viewer permissions', async () => {
  const invite = await service.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/invitations`,
    headers: headers(ownerCookie),
    payload: { email: 'viewer@example.org', role: 'viewer' },
  });
  assert.equal(invite.statusCode, 200, invite.body);
  const payload = { token: invite.json().token };
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: '/api/invitations/accept',
        headers: headers(outsiderCookie),
        payload,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: '/api/invitations/accept',
        headers: headers(viewerCookie),
        payload,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: '/api/invitations/accept',
        headers: headers(viewerCookie),
        payload,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/runs`,
        headers: { ...headers(viewerCookie), 'idempotency-key': 'viewer-test-key' },
        payload: { workflow: 'monte-carlo-pi', parameters: { samples: 1000, seed: 1 } },
      })
    ).statusCode,
    403,
  );
});
test('last owner is protected and members cannot manage roles', async () => {
  const members = (
    await service.app.inject({
      url: `/api/projects/${projectId}/members`,
      headers: headers(ownerCookie),
    })
  ).json() as { id: string; role: string }[];
  const owner = members.find((m) => m.role === 'owner')!;
  const url = `/api/projects/${projectId}/members/${owner.id}`;
  assert.equal(
    (
      await service.app.inject({
        method: 'PATCH',
        url,
        headers: headers(ownerCookie),
        payload: { role: 'viewer' },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await service.app.inject({ method: 'DELETE', url, headers: headers(ownerCookie) })).statusCode,
    409,
  );
  assert.equal(
    (
      await service.app.inject({
        method: 'PATCH',
        url,
        headers: headers(viewerCookie),
        payload: { role: 'viewer' },
      })
    ).statusCode,
    403,
  );
});
test('upload retains exact bytes, real preview, checksum, and download authorization', async () => {
  const bytes = 'value,label\n1,a\n2,b\n3,c\n4,d\n';
  const payload = `--boundary\r\nContent-Disposition: form-data; name="file"; filename="observations.csv"\r\nContent-Type: text/csv\r\n\r\n${bytes}\r\n--boundary--\r\n`;
  const response = await service.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/files`,
    headers: { ...headers(ownerCookie), 'content-type': 'multipart/form-data; boundary=boundary' },
    payload,
  });
  assert.equal(response.statusCode, 201, response.body);
  fileId = response.json().id;
  const download = await service.app.inject({
    url: `/api/files/${fileId}/download`,
    headers: headers(ownerCookie),
  });
  assert.equal(download.body, bytes);
  assert.equal(
    (
      await service.app.inject({
        url: `/api/files/${fileId}/download`,
        headers: headers(outsiderCookie),
      })
    ).statusCode,
    404,
  );
  const preview = await service.app.inject({
    url: `/api/files/${fileId}/preview`,
    headers: headers(ownerCookie),
  });
  assert.deepEqual(preview.json().headers, ['value', 'label']);
  assert.deepEqual(preview.json().rows[0], ['1', 'a']);
});
test('submission is idempotent, pins inputs, and refuses conflicting retries', async () => {
  const payload = { workflow: 'csv-summary', inputFileId: fileId, parameters: { column: 'value' } };
  const request = {
    method: 'POST' as const,
    url: `/api/projects/${projectId}/runs`,
    headers: { ...headers(ownerCookie), 'idempotency-key': 'stable-submission-key' },
    payload,
  };
  const first = await service.app.inject(request);
  assert.equal(first.statusCode, 201, first.body);
  runId = first.json().id;
  const second = await service.app.inject(request);
  assert.equal(second.json().id, runId);
  assert.equal(second.statusCode, 200);
  const changed = await service.app.inject({
    ...request,
    payload: { ...payload, parameters: { column: 'label' } },
  });
  assert.equal(changed.statusCode, 409);
});
test('worker executes stored input, persists an artifact, and exports evidence', async () => {
  const runner = createRunner(service.db, service.storage, {
    error: (error) => {
      throw error;
    },
  });
  try {
    await runner.tick();
  } finally {
    await runner.stop();
  }
  const response = await service.app.inject({
    url: `/api/runs/${runId}`,
    headers: headers(ownerCookie),
  });
  assert.equal(response.json().status, 'succeeded', response.body);
  assert.equal(response.json().result.mean, 2.5);
  const manifest = await service.app.inject({
    url: `/api/runs/${runId}/manifest`,
    headers: headers(ownerCookie),
  });
  assert.equal(manifest.json().execution.input.id, fileId);
  assert.equal(manifest.json().artifacts.length, 1);
  const result = await service.app.inject({
    url: `/api/files/${manifest.json().artifacts[0].id}/download`,
    headers: headers(ownerCookie),
  });
  assert.equal(result.json().median, 2.5);
  for (const suffix of ['', '/manifest', '/analyses'])
    assert.equal(
      (
        await service.app.inject({
          url: `/api/runs/${runId}${suffix}`,
          headers: headers(outsiderCookie),
        })
      ).statusCode,
      404,
    );
});
test('AI is optional and fails explicitly without provider configuration', async () => {
  const report = await service.app.inject({
    url: `/api/runs/${runId}/evidence-report`,
    headers: headers(ownerCookie),
  });
  assert.equal(report.statusCode, 200, report.body);
  assert.equal(report.json().usesAi, false);
  assert.match(report.json().text, /2.5/);
  assert.equal(
    (
      await service.app.inject({
        url: `/api/runs/${runId}/evidence-report`,
        headers: headers(outsiderCookie),
      })
    ).statusCode,
    404,
  );
  const response = await service.app.inject({
    method: 'POST',
    url: `/api/runs/${runId}/analyses`,
    headers: headers(ownerCookie),
    payload: { question: 'Explain the results' },
  });
  assert.equal(response.statusCode, 503);
});
test('queued cancellation survives worker polling and is audited', async () => {
  const response = await service.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/runs`,
    headers: { ...headers(ownerCookie), 'idempotency-key': 'cancel-test-key' },
    payload: { workflow: 'monte-carlo-pi', parameters: { samples: 1000, seed: 1 } },
  });
  const id = response.json().id;
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: `/api/runs/${id}/cancel`,
        headers: headers(ownerCookie),
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await service.app.inject({ url: `/api/runs/${id}`, headers: headers(ownerCookie) })).json()
      .status,
    'cancelled',
  );
  const audit = (
    await service.app.inject({
      url: `/api/projects/${projectId}/audit`,
      headers: headers(ownerCookie),
    })
  ).json() as { action: string }[];
  assert.ok(audit.some((e) => e.action === 'run.cancelled'));
});

async function submitReference(key: string) {
  const response = await service.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/runs`,
    headers: { ...headers(ownerCookie), 'idempotency-key': key },
    payload: { workflow: 'monte-carlo-pi', parameters: { samples: 1000, seed: 42 } },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().id as string;
}
async function pollWorker() {
  const runner = createRunner(service.db, service.storage, {
    error: (error) => {
      throw error;
    },
  });
  try {
    await runner.tick();
  } finally {
    await runner.stop();
  }
}
test('expired leases recover pure local execution without creating a new logical run', async () => {
  const id = await submitReference('lease-recovery-test');
  await service.db.query(
    `UPDATE runs SET status='running',attempt=1,lease_until=now()-interval '1 second' WHERE id=$1`,
    [id],
  );
  await pollWorker();
  const response = await service.app.inject({
    url: `/api/runs/${id}`,
    headers: headers(ownerCookie),
  });
  assert.equal(response.json().status, 'succeeded', response.body);
  assert.equal(response.json().attempt, 2);
});
test('recovery is bounded and exhausted runs become terminal', async () => {
  const id = await submitReference('recovery-limit-test');
  await service.db.query(
    `UPDATE runs SET status='running',attempt=3,lease_until=now()-interval '1 second' WHERE id=$1`,
    [id],
  );
  await pollWorker();
  const response = await service.app.inject({
    url: `/api/runs/${id}`,
    headers: headers(ownerCookie),
  });
  assert.equal(response.json().status, 'failed');
  assert.match(response.json().error, /recovery limit/);
  assert.equal(response.json().validation_status, 'invalid');
});
test('corrupted inputs fail integrity validation instead of producing scientific output', async () => {
  const original = await service.storage.get(fileId);
  const response = await service.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/runs`,
    headers: { ...headers(ownerCookie), 'idempotency-key': 'integrity-test-key' },
    payload: { workflow: 'csv-summary', inputFileId: fileId, parameters: { column: 'value' } },
  });
  assert.equal(response.statusCode, 201, response.body);
  await service.storage.remove(fileId);
  await service.storage.put(fileId, Buffer.from('value\n999\n'));
  try {
    await pollWorker();
    const run = await service.app.inject({
      url: `/api/runs/${response.json().id}`,
      headers: headers(ownerCookie),
    });
    assert.equal(run.json().status, 'failed');
    assert.match(run.json().error, /checksum mismatch/);
    assert.equal(run.json().result, null);
    assert.equal(
      (
        await service.app.inject({
          url: `/api/files/${fileId}/download`,
          headers: headers(ownerCookie),
        })
      ).statusCode,
      409,
    );
  } finally {
    await service.storage.remove(fileId);
    await service.storage.put(fileId, original);
  }
});
test('concurrent project queue limits reject excessive jobs', async () => {
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push(await submitReference(`quota-limit-test-${i}`));
  const response = await service.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/runs`,
    headers: { ...headers(ownerCookie), 'idempotency-key': 'quota-overflow-test' },
    payload: { workflow: 'monte-carlo-pi', parameters: { samples: 1000, seed: 1 } },
  });
  assert.equal(response.statusCode, 429);
  for (const id of ids)
    await service.app.inject({
      method: 'POST',
      url: `/api/runs/${id}/cancel`,
      headers: headers(ownerCookie),
    });
});
test('expired invitations cannot create membership', async () => {
  const response = await service.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/invitations`,
    headers: headers(ownerCookie),
    payload: { email: 'outsider@example.org', role: 'collaborator' },
  });
  assert.equal(response.statusCode, 200, response.body);
  await service.db.query(
    `UPDATE invitations SET expires_at=now()-interval '1 second' WHERE email='outsider@example.org'`,
  );
  const accepted = await service.app.inject({
    method: 'POST',
    url: '/api/invitations/accept',
    headers: headers(outsiderCookie),
    payload: { token: response.json().token },
  });
  assert.equal(accepted.statusCode, 404);
});
test('project archiving requires an owner and refuses active jobs', async () => {
  const url = `/api/projects/${projectId}/archive`;
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url,
        headers: headers(viewerCookie),
        payload: { archived: true },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url,
        headers: headers(outsiderCookie),
        payload: { archived: true },
      })
    ).statusCode,
    404,
  );
  const id = await submitReference('archive-active-run');
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url,
        headers: headers(ownerCookie),
        payload: { archived: true },
      })
    ).statusCode,
    409,
  );
  await service.app.inject({
    method: 'POST',
    url: `/api/runs/${id}/cancel`,
    headers: headers(ownerCookie),
  });
});
test('archiving retains evidence, blocks new research, and can be restored', async () => {
  const url = `/api/projects/${projectId}/archive`;
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url,
        headers: headers(ownerCookie),
        payload: { archived: true },
      })
    ).statusCode,
    200,
  );
  const list = (
    await service.app.inject({ url: '/api/projects', headers: headers(ownerCookie) })
  ).json();
  assert.ok(list.find((p: { id: string }) => p.id === projectId).archived_at);
  assert.equal(
    (
      await service.app.inject({
        url: `/api/files/${fileId}/download`,
        headers: headers(viewerCookie),
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await service.app.inject({
        url: `/api/runs/${runId}/manifest`,
        headers: headers(ownerCookie),
      })
    ).statusCode,
    200,
  );
  for (const item of [
    { url: `/api/projects/${projectId}/files`, payload: {} },
    {
      url: `/api/projects/${projectId}/runs`,
      payload: { workflow: 'monte-carlo-pi', parameters: { samples: 1000, seed: 1 } },
    },
    {
      url: `/api/projects/${projectId}/invitations`,
      payload: { email: 'archived@example.org', role: 'viewer' },
    },
  ]) {
    const response = await service.app.inject({
      method: 'POST',
      url: item.url,
      headers: { ...headers(ownerCookie), 'idempotency-key': 'archived-write-test' },
      payload: item.payload,
    });
    assert.equal(response.statusCode, 409, response.body);
  }
  assert.equal(
    (
      await service.app.inject({
        method: 'PATCH',
        url: `/api/projects/${projectId}`,
        headers: headers(ownerCookie),
        payload: { name: 'Archived change' },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url,
        headers: headers(ownerCookie),
        payload: { archived: false },
      })
    ).statusCode,
    200,
  );
  const id = await submitReference('restored-run-test');
  await service.app.inject({
    method: 'POST',
    url: `/api/runs/${id}/cancel`,
    headers: headers(ownerCookie),
  });
  const events = (
    await service.app.inject({
      url: `/api/projects/${projectId}/audit`,
      headers: headers(ownerCookie),
    })
  ).json() as { action: string }[];
  assert.ok(events.some((event) => event.action === 'project.archived'));
  assert.ok(events.some((event) => event.action === 'project.restored'));
});
test('revocation immediately blocks existing sessions from project resources', async () => {
  const list = await service.app.inject({
    url: `/api/projects/${projectId}/members`,
    headers: headers(ownerCookie),
  });
  const viewer = list
    .json()
    .find((member: MemberFixture) => member.email === 'viewer@example.org') as MemberFixture;
  assert.equal(
    (
      await service.app.inject({
        method: 'DELETE',
        url: `/api/projects/${projectId}/members/${viewer.id}`,
        headers: headers(ownerCookie),
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await service.app.inject({
        url: `/api/files/${fileId}/download`,
        headers: headers(viewerCookie),
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await service.app.inject({
        url: `/api/runs/${runId}/manifest`,
        headers: headers(viewerCookie),
      })
    ).statusCode,
    404,
  );
});
type MemberFixture = { id: string; email: string };
test('logout revokes the server-side session', async () => {
  assert.equal(
    (
      await service.app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: headers(ownerCookie),
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await service.app.inject({ url: '/api/projects', headers: headers(ownerCookie) })).statusCode,
    401,
  );
});
