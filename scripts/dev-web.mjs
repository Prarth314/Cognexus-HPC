// Wait for the API before exposing the frontend. The parent concurrently process
// supervises both services and stops the other if one exits.
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
if (existsSync('.env')) process.loadEnvFile('.env');
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 3000)
  throw new Error('Set PORT to an available API port other than the frontend port 3000');
const origin = `http://127.0.0.1:${port}`;
console.log('Waiting for the Cognexus API to finish starting…');
const deadline = Date.now() + 45000;
while (true) {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (response.ok && (await response.json()).status === 'ok') break;
  } catch {}
  if (Date.now() > deadline) {
    console.error(
      'The API did not become ready. Check the API terminal output, then run npm run dev from the Cognexus-HPC folder.',
    );
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
const server = await createServer();
await server.listen();
console.log('Cognexus is ready. Open http://localhost:3000');
server.printUrls();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void server.close().finally(() => process.exit(0));
  });
