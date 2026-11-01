import { mkdir, readdir, lstat, open, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { sha256 } from './pilot-runtime.mjs';
async function readRegular(file, limit = 64 * 1024 * 1024) {
  // Read the opened object, not a pathname checked earlier. Bound growth while reading too.
  const handle = await open(
    file,
    constants.O_RDONLY |
      (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK),
  );
  try {
    const stat = await handle.stat({ bigint: true }),
      named = await lstat(file, { bigint: true });
    if (
      !stat.isFile() ||
      named.isSymbolicLink() ||
      stat.ino !== named.ino ||
      stat.dev !== named.dev ||
      stat.nlink !== 1n ||
      stat.size > BigInt(limit)
    )
      throw new Error('Snapshot requires bounded unlinked regular files');
    const chunks = [];
    let total = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(65536, limit - total + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > limit) throw new Error('Pilot snapshot bound exceeded');
      chunks.push(chunk.subarray(0, bytesRead));
    }
    const after = await handle.stat({ bigint: true });
    if (after.size !== stat.size || after.mtimeNs !== stat.mtimeNs || after.nlink !== 1n)
      throw new Error('Snapshot file changed while reading');
    return Buffer.concat(chunks, total);
  } finally {
    await handle.close();
  }
}
// Offline disk/PGlite copy. Caller must stop EVERY writer first; this does not take a live snapshot.
// New destination only, regular files only, bounded size, and every copied file is rechecked.
export async function snapshot(source, destination, revision, expected) {
  if ((await lstat(source)).isSymbolicLink()) throw new Error('Snapshot refuses symbolic links');
  await mkdir(destination, { mode: 0o700 });
  const entries = [];
  let total = 0;
  async function visit(relative = '') {
    for (const item of await readdir(path.join(source, relative), { withFileTypes: true })) {
      if (!relative && item.name === 'snapshot-manifest.json') continue;
      const name = path.join(relative, item.name),
        from = path.join(source, name),
        to = path.join(destination, name);
      const stat = await lstat(from);
      if (stat.isSymbolicLink()) throw new Error('Snapshot refuses symbolic links');
      if (stat.isDirectory()) {
        await mkdir(to, { mode: 0o700 });
        await visit(name);
      } else {
        if (!stat.isFile() || stat.nlink !== 1)
          throw new Error('Snapshot requires unlinked regular files');
        total += stat.size;
        if (stat.size > 64 * 1024 * 1024 || total > 512 * 1024 * 1024 || entries.length >= 20000)
          throw new Error('Pilot snapshot bound exceeded');
        const portableName = name.split(path.sep).join('/');
        if (expected && !expected.has(portableName)) throw new Error('Unlisted snapshot file');
        const bytes = await readRegular(from),
          hash = sha256(bytes);
        if (bytes.length !== stat.size) throw new Error('Snapshot file changed while reading');
        if (expected && expected.get(portableName) !== hash)
          throw new Error('Snapshot integrity failed during restore');
        await writeFile(to, bytes, { flag: 'wx', mode: 0o600 });
        if (sha256(await readRegular(to)) !== hash)
          throw new Error('Snapshot bytes changed during copy');
        entries.push({ name: name.split(path.sep).join('/'), bytes: stat.size, sha256: hash });
      }
    }
  }
  await visit();
  await writeFile(
    path.join(destination, 'snapshot-manifest.json'),
    JSON.stringify(
      {
        revision,
        createdAt: new Date().toISOString(),
        consistency: 'all application and worker writers stopped by operator',
        entries,
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
  return { files: entries.length, bytes: total };
}
export async function restore(source, destination) {
  if ((await lstat(source)).isSymbolicLink()) throw new Error('Snapshot refuses symbolic links');
  const manifest = JSON.parse(
    (await readRegular(path.join(source, 'snapshot-manifest.json'), 8 * 1024 * 1024)).toString(
      'utf8',
    ),
  );
  if (!Array.isArray(manifest.entries) || manifest.entries.length > 20000)
    throw new Error('Invalid snapshot manifest');
  let total = 0;
  const expected = new Map();
  for (const entry of manifest.entries) {
    if (
      typeof entry.name !== 'string' ||
      entry.name.split('/').some((part) => !part || part === '..' || part === '.') ||
      /[\\:]/.test(entry.name)
    )
      throw new Error('Unsafe snapshot path');
    if (
      !Number.isInteger(entry.bytes) ||
      entry.bytes < 0 ||
      entry.bytes > 64 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      expected.has(entry.name)
    )
      throw new Error('Invalid snapshot entry');
    total += entry.bytes;
    if (total > 512 * 1024 * 1024) throw new Error('Pilot snapshot bound exceeded');
    expected.set(entry.name, entry.sha256);
    const file = path.join(source, entry.name);
    const bytes = await readRegular(file);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256)
      throw new Error('Snapshot integrity failed: ' + entry.name);
  }
  // Reuse the bounded copier; destination must not exist. No deletion or overwrite is supported.
  return snapshot(source, destination, manifest.revision, expected);
}
