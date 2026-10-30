import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('dist-server/server', { recursive:true });
await copyFile('server/compute.mjs','dist-server/server/compute.mjs');
