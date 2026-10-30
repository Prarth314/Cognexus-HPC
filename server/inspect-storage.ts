import { existsSync } from 'node:fs';
import { readConfig } from './config.js';
import { openDatabase } from './db.js';
import path from 'node:path';
import { createStorage } from './storage.js';
import { inspectStorage } from './maintenance.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const config = readConfig();
if (!config.databaseUrl && !existsSync(path.join(config.dataDir, 'db', 'PG_VERSION')))
  throw new Error(
    'No initialized local database found. Start the application or run migrations before inspection.',
  );
const args = new Set(process.argv.slice(2));
for (const argument of args)
  if (argument !== '--verify')
    throw new Error('Supported option: --verify. This command never deletes data.');
const db = await openDatabase(config);
try {
  const report = await inspectStorage(db, createStorage(config), { verify: args.has('--verify') });
  console.log(JSON.stringify(report, null, 2));
  if (!report.consistent) process.exitCode = 1;
} finally {
  await db.close();
}
