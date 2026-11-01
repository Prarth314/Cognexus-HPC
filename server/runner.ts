import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import type { Database } from './db.js';
import type { Storage } from './storage.js';
import { digest } from './security.js';
import type { Run } from '../shared/contracts.js';

interface ClaimedRun extends Run {
  created_by: string;
  input_snapshot: { sha256: string; storage_key: string; bytes?: number } | null;
}
export async function runComputation(
  workflow: string,
  parameters: unknown,
  input: string,
  signal?: AbortSignal,
  options: { timeoutMs?: number; workerUrl?: URL } = {},
): Promise<Record<string, unknown>> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
    throw new Error('Invalid execution timeout');
  return new Promise((resolve, reject) => {
    // Internal test seam only; HTTP requests cannot select worker code or limits.
    const worker = new Worker(options.workerUrl ?? new URL('./compute.mjs', import.meta.url), {
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
      () => finish(new Error('Execution exceeded configured time limit')),
      timeoutMs,
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
  options: { compute?: typeof runComputation; automaticPolling?: boolean } = {},
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
        `UPDATE runs SET status=CASE WHEN attempt >= 3 THEN 'failed' ELSE 'queued' END, validation_status=CASE WHEN attempt >= 3 THEN 'invalid' ELSE 'pending' END, error=CASE WHEN attempt >= 3 THEN 'Worker recovery limit exceeded' ELSE NULL END, finished_at=CASE WHEN attempt >= 3 THEN now() ELSE NULL END, lease_until=NULL WHERE status='running' AND lease_until < now()`,
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
          const bytes = await storage.get(job.input_snapshot.storage_key, job.input_snapshot.bytes);
          if (digest(bytes) !== job.input_snapshot.sha256)
            throw new Error('Input checksum mismatch; execution refused');
          input = bytes.toString('utf8');
        }
        const computationStarted = performance.now();
        const result = await (options.compute ?? runComputation)(
          job.workflow,
          job.parameters,
          input,
          active.abort.signal,
        );
        const computeMilliseconds = performance.now() - computationStarted;
        const artifact = Buffer.from(JSON.stringify(result, null, 2));
        const artifactId = randomUUID();
        let retained = false;
        try {
          await storage.put(artifactId, artifact);
          retained = await db.transaction(async (tx) => {
            await tx.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE', [job.project_id]);
            const [{ total, count }] = await tx.query<{ total: number; count: number }>(
              'SELECT COALESCE(sum(bytes),0)::int AS total,count(*)::int AS count FROM files WHERE project_id=$1',
              [job.project_id],
            );
            if (total + artifact.length > 250 * 1024 * 1024 || count >= 500)
              throw new Error('Project artifact storage quota reached; contact the project owner');
            const rows = await tx.query(
              `UPDATE runs SET status='succeeded', validation_status='valid', result=$2::jsonb, manifest=jsonb_set(manifest,'{timings}',$4::jsonb), finished_at=now(), lease_until=NULL, logs=logs || E'\nOutput schema validated; scientific validity requires domain review.' WHERE id=$1 AND status='running' AND attempt=$3 RETURNING id`,
              [
                job.id,
                JSON.stringify(result),
                job.attempt,
                JSON.stringify({ computeMilliseconds }),
              ],
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
          if (!retained) {
            // A COMMIT acknowledgment may be lost after PostgreSQL retained the artifact.
            // Never delete a possibly committed object when the database cannot answer.
            try {
              const references = await db.query('SELECT id FROM files WHERE storage_key=$1', [
                artifactId,
              ]);
              if (!references.length) await storage.remove(artifactId);
            } catch (error) {
              log.error(error);
            }
          }
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
              error instanceof Error &&
              /^(?:Input checksum mismatch; execution refused|Execution cancelled|Execution exceeded configured time limit|Invalid bounded Monte Carlo parameters|Unsupported workflow|CSV headers must be non-empty, unique, and safe property names|Selected column does not exist in the CSV|CSV exceeds 100,000-row workflow limit|Selected column contains non-numeric values|Values must be finite and within ±1e100|Selected column has no valid numeric observations|Project artifact storage quota reached; contact the project owner|CSV input is malformed or exceeds parser limits)$/.test(
                error.message,
              )
                ? error.message
                : 'Execution failed safely; input or storage is unavailable or invalid',
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
    if (options.automaticPolling !== false && !busy && !stopped) inFlight = tick();
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
