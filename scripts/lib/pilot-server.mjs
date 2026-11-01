// Disposable integration harness for the compiled application, never a deployment entry point.
import { buildApp } from '../../dist-server/server/app.js';
import { readConfig } from '../../dist-server/server/config.js';
if (!process.env.PILOT_DATA_DIR) throw new Error('A disposable data directory is required');
const config = readConfig({
  DATA_DIR: process.env.PILOT_DATA_DIR,
  DATABASE_URL: process.env.PILOT_DATABASE_URL,
  OPERATIONS_TOKEN: 'synthetic-pilot-operations-token-32-chars',
});
const { app } = await buildApp({
  config,
  logger: false,
  worker: process.env.PILOT_WORKER !== 'disabled',
});
const url = await app.listen({ port: 0, host: '127.0.0.1' });
// Bind browser Origin verification to this process's ephemeral loopback listener.
config.origin = url;
console.log(JSON.stringify({ url }));
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  process.exit(0);
}
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, shutdown);
// Windows does not deliver child.kill(SIGTERM) like POSIX; IPC exercises graceful close there too.
process.on('message', (message) => {
  if (message === 'shutdown') void shutdown();
});
