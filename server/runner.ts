import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import type { Database } from './db.js';
import type { Storage } from './storage.js';
import { digest } from './security.js';
import type { Run } from '../shared/contracts.js';

interface ClaimedRun extends Run {
  created_by: string;
  input_snapshot: { sha256: string; storage_key: string } | null;
}
export async function runComputation(
  workflow: string,
  parameters: unknown,
  input: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./compute.mjs', import.meta.url), {
      workerData: { workflow, parameters, input },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
      execArgv: [],
    });
    let finished = false;
    const finish = (error?: Error, result?: Record<string, unknown>) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () => finish(new Error('Execution cancelled'));
    const timeout = setTimeout(
      () => finish(new Error('Execution exceeded 30-second limit')),
      30_000,
    );
    worker.once('message', (message) =>
      finish(message.ok ? undefined : new Error(message.error), message.result),
    );
    worker.once('error', (error) => finish(error));
    worker.once('exit', (code) => {
      if (!finished) finish(new Error(`Worker exited before returning output (${code})`));
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export function createRunner(
  db: Database,
  storage: Storage,
  log: { error: (error: unknown) => void },
) {
  let stopped = false,
    busy = false;
  let active: { id: string; abort: AbortController } | undefined;
  let inFlight: Promise<void> | undefined;
  let lastPollAt: number | null = null;

  async function tick() {
    if (stopped || busy) return;
    busy = true;
    let claimed: ClaimedRun | undefined;
    try {
      // Only pure local workloads may be replayed after lease expiry. External schedulers
      // require reconciliation and must not be added to this automatic retry path.
      await db.query(
        `UPDATE runs SET status=CASE WHEN attempt >= 3 THEN 'failed' ELSE 'queued' END, error=CASE WHEN attempt >= 3 THEN 'Worker recovery limit exceeded' ELSE NULL END, finished_at=CASE WHEN attempt >= 3 THEN now() ELSE NULL END WHERE status='running' AND lease_until < now()`,
      );
      claimed = await db.transaction(async (tx) => {
        const [candidate] = await tx.query<ClaimedRun>(
          `SELECT * FROM runs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
        );
        if (!candidate) return undefined;
        const [updated] = await tx.query<ClaimedRun>(
          `UPDATE runs SET status='running', attempt=attempt+1, started_at=now(), lease_until=now()+interval '90 seconds', logs='Approved local CPU workflow started. No institutional HPC resources are used.' WHERE id=$1 RETURNING *`,
          [candidate.id],
        );
        return updated;
      });
      lastPollAt = Date.now();
      if (!claimed) return;
      const job = claimed;
      active = { id: job.id, abort: new AbortController() };
      const heartbeat = setInterval(() => {
        void db
          .query<{ status: string }>('SELECT status FROM runs WHERE id=$1', [job.id])
          .then(([row]) => {
            if (row?.status !== 'running') active?.abort.abort();
          })
          .catch(log.error);
      }, 500);
      try {
        let input = '';
        if (job.input_snapshot) {
          const bytes = await storage.get(job.input_snapshot.storage_key);
          if (digest(bytes) !== job.input_snapshot.sha256)
            throw new Error('Input checksum mismatch; execution refused');
          input = bytes.toString('utf8');
        }
        const result = await runComputation(
          job.workflow,
          job.parameters,
          input,
          active.abort.signal,
        );
        const artifact = Buffer.from(JSON.stringify(result, null, 2));
        const artifactId = randomUUID();
        await storage.put(artifactId, artifact);
        let retained = false;
        try {
          retained = await db.transaction(async (tx) => {
            await tx.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE', [job.project_id]);
            const [{ total, count }] = await tx.query<{ total: number; count: number }>(
              'SELECT COALESCE(sum(bytes),0)::int AS total,count(*)::int AS count FROM files WHERE project_id=$1',
              [job.project_id],
            );
            if (total + artifact.length > 250 * 1024 * 1024 || count >= 500)
              throw new Error('Project artifact storage quota reached; contact the project owner');
            const rows = await tx.query(
              `UPDATE runs SET status='succeeded', validation_status='valid', result=$2::jsonb, finished_at=now(), lease_until=NULL, logs=logs || E'\nOutput schema validated; scientific validity requires domain review.' WHERE id=$1 AND status='running' AND attempt=$3 RETURNING id`,
              [job.id, JSON.stringify(result), job.attempt],
            );
            if (!rows.length) return false;
            await tx.query(
              `INSERT INTO files(id,project_id,name,storage_key,bytes,sha256,media_type,source_run_id,created_by) VALUES($1::uuid,$2,$3,$1::text,$4,$5,'application/json',$6,$7)`,
              [
                artifactId,
                job.project_id,
                `${job.workflow}-${job.id.slice(0, 8)}.json`,
                artifact.length,
                digest(artifact),
                job.id,
                job.created_by,
              ],
            );
            await tx.query(
              `INSERT INTO audit_events(id,project_id,actor_id,action,details) VALUES($1,$2,$3,'run.completed',$4::jsonb)`,
              [
                randomUUID(),
                job.project_id,
                job.created_by,
                JSON.stringify({ runId: job.id, artifactId }),
              ],
            );
            return true;
          });
        } finally {
          if (!retained) await storage.remove(artifactId);
        }
      } finally {
        clearInterval(heartbeat);
        active = undefined;
      }
    } catch (error) {
      if (claimed)
        await db
          .query(
            `UPDATE runs SET status='failed', validation_status='invalid', error=$2, finished_at=now(), lease_until=NULL WHERE id=$1 AND status='running' AND attempt=$3`,
            [
              claimed.id,
              error instanceof Error ? error.message : 'Execution failed',
              claimed.attempt,
            ],
          )
          .catch(log.error);
      else log.error(error);
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(() => {
    if (!busy && !stopped) inFlight = tick();
  }, 1000);
  timer.unref();
  return {
    state() {
      return { enabled: !stopped, busy, lastPollAt };
    },
    tick() {
      if (!busy && !stopped) inFlight = tick();
      return inFlight || Promise.resolve();
    },
    cancel(id: string) {
      if (active?.id === id) active.abort.abort();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      active?.abort.abort();
      await inFlight;
    },
  };
}
