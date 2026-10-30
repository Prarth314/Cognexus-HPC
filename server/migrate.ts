import { readConfig } from './config.js';
import { migrate, openDatabase } from './db.js';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const db = await openDatabase(readConfig());
try { await migrate(db); console.log('Database migrations applied.'); }
finally { await db.close(); }
