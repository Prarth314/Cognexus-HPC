import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { snapshot, restore } from '../scripts/lib/offline-snapshot.mjs';

test('offline snapshot restores exact bytes, refuses overwrite and detects corruption', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cognexus-backup-test-'));
  try {
    const source = path.join(root, 'source'),
      backup = path.join(root, 'backup'),
      target = path.join(root, 'target');
    await mkdir(source);
    await mkdir(path.join(source, 'objects'));
    await writeFile(path.join(source, 'objects', 'fixture'), 'synthetic-private-bytes');
    const report = await snapshot(source, backup, 'test-revision');
    assert.equal(report.files, 1);
    await restore(backup, target);
    assert.equal(
      await readFile(path.join(target, 'objects', 'fixture'), 'utf8'),
      'synthetic-private-bytes',
    );
    await assert.rejects(restore(backup, target), /EEXIST/);
    await writeFile(path.join(backup, 'unlisted'), 'unexpected');
    await assert.rejects(
      restore(backup, path.join(root, 'extra-target')),
      /Unlisted snapshot file/,
    );
    await rm(path.join(backup, 'unlisted'));
    await writeFile(path.join(backup, 'objects', 'fixture'), 'corrupted');
    await assert.rejects(restore(backup, path.join(root, 'corrupt-target')), /integrity failed/);
  } finally {
    assert.match(path.relative(os.tmpdir(), root), /^cognexus-backup-test-[^\\/]+$/);
    await rm(root, { recursive: true, force: true });
  }
});
test('restore rejects path traversal in a manifest before creating a destination', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cognexus-backup-test-'));
  try {
    await writeFile(
      path.join(root, 'snapshot-manifest.json'),
      JSON.stringify({ entries: [{ name: '../secret', bytes: 1, sha256: 'invalid' }] }),
    );
    await assert.rejects(restore(root, path.join(root, 'target')), /Unsafe snapshot path/);
  } finally {
    assert.match(path.relative(os.tmpdir(), root), /^cognexus-backup-test-[^\\/]+$/);
    await rm(root, { recursive: true, force: true });
  }
});
