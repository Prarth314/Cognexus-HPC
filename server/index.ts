import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const config = readConfig();
const { app } = await buildApp({ config });
const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
await app.listen({ port: config.port, host: config.production ? '0.0.0.0' : '127.0.0.1' });
