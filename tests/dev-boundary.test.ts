import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

test('Vite refuses private data through direct, raw, encoded, and filesystem requests', async () => {
  const directory = await mkdtemp(path.resolve('.data-security-test-'));
  const filename = path.join(directory, 'private.txt'),
    marker = 'synthetic-private-boundary-marker';
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  const server = await createServer({
    logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1', watch: null, strictPort: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    await writeFile(filename, marker);
    await server.listen();
    const address = server.httpServer!.address();
    assert.ok(address && typeof address === 'object');
    for (const route of [
      `/${path.basename(directory)}/private.txt`,
      `/${path.basename(directory)}/private.txt?raw`,
      `/${path.basename(directory)}/%70rivate.txt`,
      `/@fs/${filename.replaceAll('\\', '/')}`,
      `/@fs/${filename.replaceAll('\\', '/')}?raw`,
    ]) {
      const response = await fetch(`http://127.0.0.1:${address.port}${route}`);
      assert.notEqual(response.status, 200, route);
      assert.ok(!(await response.text()).includes(marker), route);
    }
    const page = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(page.status, 200);
  } finally {
    await server.close();
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
