import path from 'node:path';
import { snapshot, restore } from './lib/offline-snapshot.mjs';
const [operation, acknowledgment, source, destination] = process.argv.slice(2);
if (
  !['backup', 'restore'].includes(operation) ||
  acknowledgment !== '--all-writers-stopped' ||
  !source ||
  !destination ||
  process.argv.length !== 6
)
  throw new Error(
    'Usage: node scripts/offline-backup.mjs backup|restore --all-writers-stopped SOURCE NEW_DESTINATION',
  );
const from = path.resolve(source),
  to = path.resolve(destination);
const relative = path.relative(from, to);
if (
  !relative ||
  (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
)
  throw new Error('Destination must be outside the source');
const result =
  operation === 'backup'
    ? await snapshot(from, to, process.env.APP_REVISION || 'unrecorded')
    : await restore(from, to);
console.log(
  JSON.stringify({
    operation,
    ...result,
    warning:
      'Offline disk snapshot only. PostgreSQL needs a paired pg_dump. Protect and encrypt this sensitive backup.',
  }),
);
