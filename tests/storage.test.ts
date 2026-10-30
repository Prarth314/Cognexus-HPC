import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, utimes } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readConfig } from '../server/config.js';
import { openDatabase, migrate, type Database } from '../server/db.js';
import { createStorage, type Storage } from '../server/storage.js';
import { inspectStorage } from '../server/maintenance.js';
import { digest } from '../server/security.js';

let db: Database, storage: Storage, directory: string;
const user = randomUUID(),
  project = randomUUID(),
  valid = randomUUID(),
  missing = randomUUID(),
  corrupt = randomUUID(),
  wrongSize = randomUUID(),
  orphan = randomUUID();
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'cognexus-storage-tests-'));
  const config = readConfig({ DATA_DIR: directory });
  db = await openDatabase(config, true);
  await migrate(db);
  storage = createStorage(config);
  await db.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)', [
    user,
    'storage@example.test',
    'Storage fixture',
    'not-a-login',
  ]);
  await db.query('INSERT INTO projects(id,name,description,domain) VALUES($1,$2,$3,$4)', [
    project,
    'Storage test',
    '',
    'Fixtures',
  ]);
  for (const id of [valid, missing, corrupt, wrongSize])
    await db.query(
      'INSERT INTO files(id,project_id,name,storage_key,bytes,sha256,media_type,created_by) VALUES($1::uuid,$2,$3,$1::text,4,$4,$5,$6)',
      [id, project, 'fixture.txt', digest(Buffer.from('data')), 'text/plain', user],
    );
  await storage.put(valid, Buffer.from('data'));
  await storage.put(corrupt, Buffer.from('evil'));
  await storage.put(wrongSize, Buffer.from('longer'));
  await storage.put(orphan, Buffer.from('orphan'));
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await utimes(path.join(directory, 'objects', orphan), old, old);
  await writeFile(path.join(directory, 'objects', 'unrelated-operator-file'), 'leave alone');
});
after(async () => {
  await db.close();
  await rm(directory, { recursive: true, force: true });
});
test('inventory detects missing/size/checksum failures without modifying bytes', async () => {
  const report = await inspectStorage(db, storage, { verify: true });
  assert.equal(report.mode, 'read-only');
  assert.equal(report.consistent, false);
  assert.equal(report.verified, 1);
  assert.equal(report.unknownObjects, 1);
  assert.ok(
    report.issues.some((issue) => issue.fileId === missing && issue.reason === 'missing_object'),
  );
  assert.ok(
    report.issues.some((issue) => issue.fileId === corrupt && issue.reason === 'checksum_mismatch'),
  );
  assert.ok(
    report.issues.some((issue) => issue.fileId === wrongSize && issue.reason === 'size_mismatch'),
  );
  assert.equal(report.orphans[0].key, orphan);
  assert.equal(report.orphans[0].olderThan24Hours, true);
  assert.equal((await storage.get(corrupt)).toString(), 'evil');
  assert.equal((await storage.get(orphan)).toString(), 'orphan');
});
test('metadata-only inspection does not claim content was verified', async () => {
  const report = await inspectStorage(db, storage);
  assert.equal(report.verified, 0);
  assert.ok(!report.issues.some((issue) => issue.reason === 'checksum_mismatch'));
});
test('inventory bounds fail closed before any destructive operation', async () => {
  await assert.rejects(inspectStorage(db, storage, { limit: 1 }), /exceeds/);
  assert.equal((await storage.get(orphan)).toString(), 'orphan');
});
test('unrecognized object names are ignored and never fetched', async () => {
  let reads = 0;
  const fake: Storage = {
    async put() {
      throw new Error('Unexpected mutation');
    },
    async remove() {
      throw new Error('Unexpected deletion');
    },
    async get() {
      reads++;
      return Buffer.from('');
    },
    async *objects() {
      yield { key: '../outside', bytes: 0, modifiedAt: null };
    },
  };
  const report = await inspectStorage(db, fake, { verify: true });
  assert.equal(report.unknownObjects, 1);
  assert.equal(reads, 0);
});
