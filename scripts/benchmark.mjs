// Bounded local-only benchmark. Never accepts a public base URL or a production database.
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { startServer, client } from './lib/pilot-runtime.mjs';
const directory = await mkdtemp(path.join(os.tmpdir(), 'cognexus-benchmark-'));
let server;
const observations = {},
  failures = [];
const quantile = (sorted, p) => sorted[Math.ceil(p * sorted.length) - 1];
async function measured(name, operation, record = true) {
  const start = performance.now();
  try {
    return await operation();
  } catch (error) {
    failures.push({ operation: name, message: error.message });
    throw error;
  } finally {
    if (record) (observations[name] ??= []).push(performance.now() - start);
  }
}
try {
  server = await startServer(directory);
  const owner = client(server);
  await owner.register('Synthetic benchmark');
  const project = await owner.json('/projects', { name: 'Synthetic benchmark' });
  const csv =
    'value,label\n' + Array.from({ length: 10000 }, (_, i) => `${i % 100},sample-${i}\n`).join('');
  const upload = async () => {
    const form = new FormData();
    form.set('file', new Blob([csv], { type: 'text/csv' }), 'benchmark.csv');
    return owner.json(`/projects/${project.id}/files`, form);
  };
  let file;
  // Three excluded warm-ups followed by ten uploads/validations and queued CSV jobs.
  for (let i = -3; i < 10; i++) {
    file = await measured('upload', upload, i >= 0);
    await measured('csvPreviewValidation', () => owner.json(`/files/${file.id}/preview`), i >= 0);
    const run = await measured(
      'submission',
      () =>
        owner.json(
          `/projects/${project.id}/runs`,
          { workflow: 'csv-summary', inputFileId: file.id, parameters: { column: 'value' } },
          { 'idempotency-key': randomUUID() },
        ),
      i >= 0,
    );
    const result = await owner.completed(run.id, 500);
    assert.ok(Math.abs(result.result.mean - 49.5) < 1e-10);
    const manifest = await owner.json(`/runs/${run.id}/manifest`);
    if (i >= 0) {
      (observations.queueWait ??= []).push(
        new Date(result.started_at) - new Date(result.created_at),
      );
      (observations.executionThroughPublication ??= []).push(
        new Date(result.finished_at) - new Date(result.started_at),
      );
      (observations.computationIncludingWorkerStartup ??= []).push(
        manifest.execution.timings.computeMilliseconds,
      );
    }
    await measured(
      'artifactDownload',
      async () => {
        const response = await owner.request(`/files/${manifest.artifacts[0].id}/download`);
        assert.equal(response.status, 200);
        await response.arrayBuffer();
      },
      i >= 0,
    );
  }
  console.log(
    'Waiting for a fresh default rate-limit window before read measurements (61 seconds).',
  );
  await wait(61000);
  for (let i = -3; i < 30; i++)
    await measured('projectList', () => owner.json('/projects'), i >= 0);
  for (let i = -3; i < 30; i++)
    await measured('fileList', () => owner.json(`/projects/${project.id}/files`), i >= 0);
  const concurrentStart = performance.now();
  for (let batch = 0; batch < 10; batch++)
    await Promise.all(
      Array.from({ length: 3 }, () =>
        measured('fileListConcurrency3', () => owner.json(`/projects/${project.id}/files`)),
      ),
    );
  const concurrentSeconds = (performance.now() - concurrentStart) / 1000;
  const metrics = await (
    await fetch(server.url + '/api/metrics', {
      headers: { authorization: 'Bearer synthetic-pilot-operations-token-32-chars' },
    })
  ).text();
  const distributions = Object.fromEntries(
    Object.entries(observations).map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [
        name,
        {
          samples: values.length,
          p50Milliseconds: quantile(sorted, 0.5),
          p95Milliseconds: quantile(sorted, 0.95),
          minMilliseconds: sorted[0],
          maxMilliseconds: sorted.at(-1),
        },
      ];
    }),
  );
  const result = {
    recordedAt: new Date().toISOString(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    environment: {
      node: process.version,
      platform: os.platform(),
      architecture: os.arch(),
      cpuModel: os.cpus()[0].model,
      logicalCpus: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      topology:
        'One compiled Node API/worker process, persistent PGlite and disk on the same Windows/Linux host; localhost HTTP',
    },
    dataset: {
      rows: 10000,
      bytes: Buffer.byteLength(csv),
      projects: 1,
      uploadedVersionsAfterWarmup: 13,
    },
    method: {
      warmup: 3,
      requestConcurrency: 1,
      readConcurrencyExperiment: 3,
      quantiles: 'Nearest rank; p95 for n=10 is the sample maximum',
      computation:
        'Worker startup and computation await only; excludes queue, input read, and output publication',
      execution:
        'Database started_at to finished_at, including publication; queue wait measured separately',
      throughput: '30 file-list requests in ten batches of three; no think time',
    },
    distributions,
    concurrentFileListRequestsPerSecond: 30 / concurrentSeconds,
    serverResidentBytesAtEnd: Number(
      metrics.match(/cognexus_process_resident_memory_bytes (\d+)/)?.[1],
    ),
    errors: failures,
    limitations:
      'Small synthetic single-host sample, one project, no network/TLS/production PostgreSQL or user traffic. RSS is an end sample, not peak. No scalability, before/after speedup, or production SLO claim.',
  };
  await mkdir('.data', { recursive: true });
  await writeFile('.data/benchmark.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await server?.stop();
  assert.ok(path.relative(os.tmpdir(), directory).startsWith('cognexus-benchmark-'));
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
