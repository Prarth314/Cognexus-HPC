import type { Database } from './db.js';
import type { Storage } from './storage.js';
import { digest } from './security.js';

const objectKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
interface Reference {
  id: string;
  storage_key: string;
  project_id: string;
  bytes: number;
  sha256: string;
}
export async function inspectStorage(
  db: Database,
  storage: Storage,
  options: { verify?: boolean; limit?: number; now?: Date } = {},
) {
  const limit = options.limit || 10000;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000)
    throw new Error('Inventory limit must be between 1 and 100,000');
  const rows = await db.query<Reference>(
    'SELECT id,storage_key,project_id,bytes,sha256 FROM files ORDER BY id LIMIT $1',
    [limit + 1],
  );
  if (rows.length > limit)
    throw new Error(
      'Reference inventory exceeds the configured bound; use a larger reviewed inventory limit',
    );
  const references = new Map(rows.map((row) => [row.storage_key, row]));
  const found = new Set<string>();
  const issues: { fileId: string; projectId: string; reason: string }[] = [];
  const orphans: {
    key: string;
    bytes: number;
    modifiedAt: string | null;
    olderThan24Hours: boolean;
  }[] = [];
  let objects = 0,
    unknownObjects = 0,
    verified = 0;
  const now = options.now || new Date();
  for await (const object of storage.objects()) {
    if (++objects > limit)
      throw new Error('Object inventory exceeds the configured bound; no mutations were performed');
    if (!objectKey.test(object.key)) {
      unknownObjects++;
      continue;
    }
    const reference = references.get(object.key);
    if (!reference) {
      orphans.push({
        key: object.key,
        bytes: object.bytes,
        modifiedAt: object.modifiedAt?.toISOString() || null,
        olderThan24Hours:
          !!object.modifiedAt && now.getTime() - object.modifiedAt.getTime() > 24 * 60 * 60 * 1000,
      });
      continue;
    }
    found.add(object.key);
    if (object.bytes !== reference.bytes) {
      issues.push({
        fileId: reference.id,
        projectId: reference.project_id,
        reason: 'size_mismatch',
      });
      continue;
    }
    if (options.verify) {
      try {
        const bytes = await storage.get(object.key);
        if (digest(bytes) !== reference.sha256)
          issues.push({
            fileId: reference.id,
            projectId: reference.project_id,
            reason: 'checksum_mismatch',
          });
        else verified++;
      } catch {
        issues.push({
          fileId: reference.id,
          projectId: reference.project_id,
          reason: 'unreadable',
        });
      }
    }
  }
  for (const reference of rows)
    if (!found.has(reference.storage_key))
      issues.push({
        fileId: reference.id,
        projectId: reference.project_id,
        reason: 'missing_object',
      });
  return {
    mode: 'read-only',
    checkedAt: now.toISOString(),
    references: rows.length,
    objects,
    verified,
    unknownObjects,
    issues,
    orphans,
    consistent: issues.length === 0,
    notice:
      'No data was changed or deleted. Inventory is not an atomic backup. Review orphan candidates in a quiescent maintenance window; recent objects can be uploads in flight.',
  };
}
