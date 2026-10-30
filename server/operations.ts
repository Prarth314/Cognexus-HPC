import type { FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import type { Database } from './db.js';
import { safeEqual } from './security.js';
import { fail } from './errors.js';

interface WorkerState {
  enabled: boolean;
  busy: boolean;
  lastPollAt: number | null;
}
export function registerOperations(
  app: FastifyInstance,
  {
    db,
    config,
    workerState,
  }: { db: Database; config: Config; workerState: () => WorkerState | undefined },
) {
  const requests = new Map<string, { count: number; seconds: number }>();
  app.addHook('onResponse', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.routeOptions.url === '/api/metrics') return;
    // Only known route templates become labels. Never include raw URLs, IDs, or query strings.
    const route = request.routeOptions.url;
    if (!route || !route.startsWith('/api/')) return;
    const key = `method="${request.method}",route="${route}",status="${reply.statusCode}"`;
    const value = requests.get(key) || { count: 0, seconds: 0 };
    value.count++;
    value.seconds += reply.elapsedTime / 1000;
    requests.set(key, value);
  });
  app.get('/api/ready', async (_request, reply) => {
    try {
      await db.query('SELECT 1');
    } catch {
      return reply.code(503).send({
        status: 'not-ready',
        database: 'unavailable',
        worker: 'unknown',
        storage: 'not-probed',
      });
    }
    const worker = workerState();
    const ready =
      !!worker?.enabled && worker.lastPollAt !== null && Date.now() - worker.lastPollAt < 90000;
    return reply.code(ready ? 200 : 503).send({
      status: ready ? 'ready' : 'not-ready',
      database: 'ok',
      worker: ready ? 'polling' : worker ? 'warming-or-stale' : 'disabled',
      storage: 'not-probed',
    });
  });
  app.get('/api/metrics', async (request, reply) => {
    if (!config.operationsToken) fail(404, 'Endpoint not configured');
    const authorization = request.headers.authorization || '';
    if (!safeEqual(authorization, `Bearer ${config.operationsToken}`))
      fail(401, 'Operations authentication required');
    const jobs = await db.query<{ status: string; count: number }>(
      'SELECT status,count(*)::int AS count FROM runs GROUP BY status',
    );
    const [{ seconds }] = await db.query<{ seconds: number | null }>(
      `SELECT EXTRACT(EPOCH FROM now()-min(created_at))::float AS seconds FROM runs WHERE status='queued'`,
    );
    const lines = [
      '# HELP cognexus_http_requests_total Completed API requests by route template.',
      '# TYPE cognexus_http_requests_total counter',
      ...[...requests].map(([key, value]) => `cognexus_http_requests_total{${key}} ${value.count}`),
      '# HELP cognexus_http_request_duration_seconds_sum Total API response duration.',
      '# TYPE cognexus_http_request_duration_seconds_sum counter',
      ...[...requests].map(
        ([key, value]) => `cognexus_http_request_duration_seconds_sum{${key}} ${value.seconds}`,
      ),
      '# HELP cognexus_jobs Current job records by status.',
      '# TYPE cognexus_jobs gauge',
      ...['queued', 'running', 'succeeded', 'failed', 'cancelled'].map(
        (status) =>
          `cognexus_jobs{status="${status}"} ${jobs.find((row) => row.status === status)?.count || 0}`,
      ),
      '# HELP cognexus_oldest_queued_seconds Age of oldest queued job.',
      '# TYPE cognexus_oldest_queued_seconds gauge',
      `cognexus_oldest_queued_seconds ${Math.max(0, Number(seconds) || 0)}`,
    ];
    const worker = workerState();
    lines.push(
      '# TYPE cognexus_worker_enabled gauge',
      `cognexus_worker_enabled ${worker?.enabled ? 1 : 0}`,
    );
    if (worker?.lastPollAt)
      lines.push(
        '# TYPE cognexus_worker_last_poll_timestamp_seconds gauge',
        `cognexus_worker_last_poll_timestamp_seconds ${worker.lastPollAt / 1000}`,
      );
    reply.type('text/plain; version=0.0.4; charset=utf-8');
    return `${lines.join('\n')}\n`;
  });
}
