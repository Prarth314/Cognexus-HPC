import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { runSchema, type User, type Role, type RunRequest } from '../shared/contracts.js';
import {
  portableSchema,
  resultSchema,
  toleranceSchema,
  environmentSchema,
  type Tolerance,
} from '../shared/handover.js';
import type { Database } from './db.js';
import type { Storage } from './storage.js';
import { digest } from './security.js';
import { fail } from './errors.js';
import {
  canonical,
  compareResults,
  currentEnvironment,
  engineSha256,
} from './handover-evidence.js';

type Input = { id: string; name: string; bytes: number; sha256: string; storage_key: string };
type Snapshot = {
  workflow: RunRequest['workflow'];
  workflowVersion: '1.0.0';
  engineSha256: string;
  parameters: Record<string, string | number>;
  result: Record<string, string | number | null>;
  environment: z.infer<typeof environmentSchema>;
  tolerance: Tolerance;
  input: Input | null;
  outputs: Input[];
};
type Handover = {
  id: string;
  project_id: string;
  source_run_id: string | null;
  created_by: string;
  reference_author: string | null;
  title: string;
  notes: string;
  snapshot: Snapshot;
  snapshot_hash: string;
  origin: 'native' | 'imported';
  created_at: string;
};
type Context = {
  db: Database;
  storage: Storage;
  user: (request: FastifyRequest) => User;
  access: (
    request: FastifyRequest,
    id: string,
    write?: boolean,
    owner?: boolean,
    tx?: Database,
  ) => Promise<Role>;
  audit: (
    tx: Database,
    projectId: string,
    actor: string,
    action: string,
    details?: unknown,
  ) => Promise<void>;
  queueRun: (
    tx: Database,
    request: FastifyRequest,
    id: string,
    body: RunRequest,
    key: string,
  ) => Promise<{ id: string; replay: boolean }>;
};
const idParam = (request: FastifyRequest, key: string) =>
  z.uuid().parse((request.params as Record<string, string>)[key]);
const keySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
function summary(row: Handover) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    created_at: row.created_at,
    source_run_id: row.source_run_id,
    origin: row.origin,
    workflow: row.snapshot.workflow,
  };
}
function publicReference(snapshot: Snapshot) {
  const { input, outputs, ...rest } = snapshot;
  return {
    ...rest,
    input: input ? { name: input.name, bytes: input.bytes, sha256: input.sha256 } : null,
    outputs: outputs.map((file) => ({ name: file.name, bytes: file.bytes, sha256: file.sha256 })),
  };
}
export function registerHandoverRoutes(app: FastifyInstance, context: Context) {
  const { db, storage, user, access, audit, queueRun } = context;
  async function load(request: FastifyRequest) {
    user(request);
    const [row] = await db.query<Handover>('SELECT * FROM handovers WHERE id=$1', [
      idParam(request, 'handoverId'),
    ]);
    if (!row) fail(404, 'Handover not found');
    await access(request, row.project_id);
    if (digest(canonical(row.snapshot)) !== row.snapshot_hash)
      fail(409, 'Handover snapshot integrity failed');
    return row;
  }
  async function preflight(row: Handover) {
    const snapshot = row.snapshot,
      checks: { label: string; ok: boolean; message: string }[] = [];
    const parsed = runSchema.safeParse({ ...snapshot, inputFileId: snapshot.input?.id });
    checks.push({
      label: 'Approved workflow',
      ok: parsed.success && snapshot.workflowVersion === '1.0.0',
      message:
        'Only the two built-in reference workflows are executable. Uploaded code is never executed.',
    });
    checks.push({
      label: 'Workflow implementation',
      ok: snapshot.engineSha256 === engineSha256,
      message:
        snapshot.engineSha256 === engineSha256
          ? 'The installed computation implementation matches the reference.'
          : 'The installed workflow has changed. Create a reviewed reference on this version before verification.',
    });
    let inputOk = snapshot.workflow === 'monte-carlo-pi' && snapshot.input === null;
    if (snapshot.input) {
      try {
        const bytes = await storage.get(snapshot.input.storage_key, snapshot.input.bytes);
        inputOk = bytes.length === snapshot.input.bytes && digest(bytes) === snapshot.input.sha256;
      } catch {
        inputOk = false;
      }
    }
    checks.push({
      label: 'Pinned input',
      ok: inputOk,
      message: inputOk
        ? snapshot.input
          ? 'Input bytes match the reference checksum.'
          : 'This workflow has no input file.'
        : 'The pinned input is missing, unreadable, or changed. Restore its original bytes or create a new reference.',
    });
    let outputsOk = row.origin === 'imported' || snapshot.outputs.length > 0;
    for (const file of snapshot.outputs) {
      try {
        const bytes = await storage.get(file.storage_key, file.bytes);
        if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) outputsOk = false;
      } catch {
        outputsOk = false;
      }
    }
    checks.push({
      label: 'Reference output',
      ok: outputsOk,
      message: outputsOk
        ? row.origin === 'imported'
          ? 'Reference values came from an imported package; original authorship is unverified.'
          : 'Stored reference artifacts pass checksum verification.'
        : 'Reference artifacts are missing or changed. Restore them before verification.',
    });
    return { ready: checks.every((check) => check.ok), checks };
  }
  async function capacity(tx: Database, projectId: string) {
    const [{ count }] = await tx.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM handovers WHERE project_id=$1',
      [projectId],
    );
    if (count >= 100) fail(429, 'Project handover limit reached (100)');
  }
  app.get('/api/projects/:projectId/handovers', async (request) => {
    const id = idParam(request, 'projectId');
    await access(request, id);
    const rows = await db.query<Handover & { checks: number }>(
      'SELECT h.*,(SELECT count(*)::int FROM handover_checks c WHERE c.handover_id=h.id) AS checks FROM handovers h WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100',
      [id],
    );
    return rows.map((row) => ({ ...summary(row), checks: row.checks }));
  });
  app.post('/api/projects/:projectId/handovers', async (request, reply) => {
    const projectId = idParam(request, 'projectId');
    await access(request, projectId, true);
    const body = z
      .object({
        sourceRunId: z.uuid(),
        title: z.string().trim().min(2).max(120),
        notes: z.string().trim().max(4000).default(''),
        tolerance: toleranceSchema.default({ absolute: 0, relative: 0 }),
      })
      .strict()
      .parse(request.body);
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE', [projectId]);
      await access(request, projectId, true, false, tx);
      await capacity(tx, projectId);
      const [run] = await tx.query<{
        id: string;
        created_by: string;
        workflow: RunRequest['workflow'];
        parameters: Record<string, string | number>;
        result: unknown;
        manifest: unknown;
        input_snapshot: Input | null;
      }>(
        "SELECT * FROM runs WHERE id=$1 AND project_id=$2 AND status='succeeded' AND validation_status='valid'",
        [body.sourceRunId, projectId],
      );
      if (!run) fail(409, 'Choose a successfully completed, validated run in this project');
      const manifest = run.manifest as Record<string, unknown>;
      const snapshot: Snapshot = {
        workflow: run.workflow,
        workflowVersion: '1.0.0',
        engineSha256: String(manifest.engineSha256 || ''),
        parameters: run.parameters,
        result: resultSchema.parse(run.result),
        environment: environmentSchema.parse({
          nodeVersion: manifest.nodeVersion,
          platform: manifest.platform,
          architecture: manifest.architecture,
          revision: manifest.revision,
        }),
        tolerance: body.tolerance,
        input: run.input_snapshot,
        outputs: await tx.query<Input>(
          'SELECT id,name,bytes,sha256,storage_key FROM files WHERE source_run_id=$1 AND project_id=$2 ORDER BY id LIMIT 5',
          [run.id, projectId],
        ),
      };
      // Existing references must declare the supported version; never silently relabel another engine.
      if (manifest.workflowVersion !== '1.0.0')
        fail(409, 'This reference workflow version is unsupported');
      if (!/^[a-f0-9]{64}$/.test(snapshot.engineSha256))
        fail(
          409,
          'This run predates implementation fingerprints. Rerun the experiment before creating a handover.',
        );
      await tx.query(
        "INSERT INTO handovers(id,project_id,source_run_id,created_by,reference_author,title,notes,snapshot,snapshot_hash,origin) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'native')",
        [
          id,
          projectId,
          run.id,
          user(request).id,
          run.created_by,
          body.title,
          body.notes,
          JSON.stringify(snapshot),
          digest(canonical(snapshot)),
        ],
      );
      await audit(tx, projectId, user(request).id, 'handover.created', {
        handoverId: id,
        sourceRunId: run.id,
      });
    });
    reply.code(201);
    return { id };
  });
  app.get('/api/handovers/:handoverId', async (request) => {
    const row = await load(request);
    const verifications = await db.query<{
      id: string;
      created_at: string;
      created_by: string;
      run_id: string;
      name: string;
      status: string;
      result: unknown;
      error: string | null;
      manifest: Record<string, unknown>;
    }>(
      'SELECT c.id,c.created_at,c.created_by,c.run_id,u.name,r.status,r.result,r.error,r.manifest FROM handover_checks c JOIN users u ON u.id=c.created_by JOIN runs r ON r.id=c.run_id WHERE c.handover_id=$1 ORDER BY c.created_at DESC LIMIT 100',
      [row.id],
    );
    return {
      ...summary(row),
      checks: verifications.length,
      reference: publicReference(row.snapshot),
      preflight: await preflight(row),
      verifications: verifications.map((check) => {
        const fields =
          check.status === 'succeeded'
            ? compareResults(row.snapshot.result, check.result, row.snapshot.tolerance)
            : [];
        return {
          id: check.id,
          runId: check.run_id,
          createdAt: check.created_at,
          verifier: check.name,
          independent:
            row.origin === 'native' &&
            !!row.reference_author &&
            check.created_by !== row.reference_author &&
            check.created_by !== row.created_by,
          status:
            check.status === 'succeeded'
              ? fields.every((field) => field.matches)
                ? 'matched'
                : 'different'
              : check.status,
          fields,
          error: check.error,
          environmentDifferences: Object.entries(row.snapshot.environment)
            .filter(([key, value]) => check.manifest[key] !== value)
            .map(([key]) => key),
        };
      }),
    };
  });
  app.post('/api/handovers/:handoverId/verify', async (request, reply) => {
    const row = await load(request),
      key = keySchema.parse(request.headers['idempotency-key']);
    await access(request, row.project_id, true);
    const [previous] = await db.query<{ id: string; run_id: string }>(
      'SELECT id,run_id FROM handover_checks WHERE handover_id=$1 AND created_by=$2 AND idempotency_key=$3',
      [row.id, user(request).id, key],
    );
    if (previous) return { id: previous.id, runId: previous.run_id, replay: true };
    if (!(await preflight(row)).ready)
      fail(409, 'Resolve the handover preflight checks before verification');
    const result = await db.transaction(async (tx) => {
      await tx.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE', [row.project_id]);
      await access(request, row.project_id, true, false, tx);
      const [replay] = await tx.query<{ id: string; run_id: string }>(
        'SELECT id,run_id FROM handover_checks WHERE handover_id=$1 AND created_by=$2 AND idempotency_key=$3',
        [row.id, user(request).id, key],
      );
      if (replay) return { id: replay.id, runId: replay.run_id, replay: true };
      const [{ count }] = await tx.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM handover_checks WHERE handover_id=$1',
        [row.id],
      );
      if (count >= 100) fail(429, 'Handover verification limit reached (100)');
      if (row.snapshot.input) {
        const [file] = await tx.query<Input>(
          'SELECT id,name,bytes,sha256,storage_key FROM files WHERE id=$1 AND project_id=$2',
          [row.snapshot.input.id, row.project_id],
        );
        if (
          !file ||
          file.sha256 !== row.snapshot.input.sha256 ||
          file.bytes !== row.snapshot.input.bytes ||
          file.storage_key !== row.snapshot.input.storage_key
        )
          fail(409, 'Pinned input metadata changed; create a new reference');
      }
      const id = randomUUID(),
        body = runSchema.parse({ ...row.snapshot, inputFileId: row.snapshot.input?.id });
      const run = await queueRun(tx, request, row.project_id, body, 'handover-' + id);
      await tx.query(
        'INSERT INTO handover_checks(id,handover_id,run_id,created_by,idempotency_key) VALUES($1,$2,$3,$4,$5)',
        [id, row.id, run.id, user(request).id, key],
      );
      await audit(tx, row.project_id, user(request).id, 'handover.verification_requested', {
        handoverId: row.id,
        runId: run.id,
      });
      return { id, runId: run.id, replay: false };
    });
    reply.code(result.replay ? 200 : 201);
    return result;
  });
  app.get('/api/handovers/:handoverId/export', async (request, reply) => {
    const row = await load(request);
    if (!(await preflight(row)).ready)
      fail(409, 'Resolve preflight checks before exporting a runnable package');
    let input: null | { name: string; bytes: number; sha256: string; contentBase64: string } = null;
    if (row.snapshot.input) {
      const file = row.snapshot.input;
      if (file.bytes > 2 * 1024 * 1024)
        fail(413, 'Portable packages support input datasets up to 2 MiB');
      const bytes = await storage.get(file.storage_key, file.bytes);
      if (bytes.length !== file.bytes || digest(bytes) !== file.sha256)
        fail(409, 'Input integrity failed');
      input = {
        name: file.name,
        bytes: file.bytes,
        sha256: file.sha256,
        contentBase64: bytes.toString('base64'),
      };
    }
    const { outputs: _, input: __, ...reference } = row.snapshot;
    const content = {
      format: 'cognexus-handover' as const,
      schemaVersion: 1 as const,
      title: row.title,
      notes: row.notes,
      ...reference,
      input,
    };
    reply.header('Content-Disposition', `attachment; filename="handover-${row.id}.json"`);
    return { ...content, checksum: digest(canonical(content)) };
  });
  app.get('/api/handovers/:handoverId/report', async (request, reply) => {
    const row = await load(request);
    // Build the same current report without a second HTTP request or a second auth path.
    const checks = await db.query<{
      run_id: string;
      created_by: string;
      name: string;
      status: string;
      result: unknown;
      manifest: Record<string, unknown>;
      created_at: string;
      error: string | null;
    }>(
      'SELECT c.run_id,c.created_by,c.created_at,u.name,r.status,r.result,r.manifest,r.error FROM handover_checks c JOIN runs r ON r.id=c.run_id JOIN users u ON u.id=c.created_by WHERE c.handover_id=$1 ORDER BY c.created_at DESC LIMIT 100',
      [row.id],
    );
    reply.header('Content-Disposition', `attachment; filename="handover-report-${row.id}.json"`);
    return {
      format: 'Cognexus handover verification report',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      handover: summary(row),
      reference: publicReference(row.snapshot),
      snapshotSha256: row.snapshot_hash,
      preflight: await preflight(row),
      checks: checks.map((check) => {
        const comparison =
          check.status === 'succeeded'
            ? compareResults(row.snapshot.result, check.result, row.snapshot.tolerance)
            : [];
        return {
          runId: check.run_id,
          verifier: check.name,
          createdAt: check.created_at,
          executionStatus: check.status,
          status:
            check.status === 'succeeded'
              ? comparison.every((field) => field.matches)
                ? 'matched'
                : 'different'
              : check.status,
          independent:
            row.origin === 'native' &&
            !!row.reference_author &&
            check.created_by !== row.reference_author &&
            check.created_by !== row.created_by,
          error: check.error,
          environment: check.manifest
            ? {
                nodeVersion: check.manifest.nodeVersion,
                platform: check.manifest.platform,
                architecture: check.manifest.architecture,
                revision: check.manifest.revision,
              }
            : null,
          comparison,
        };
      }),
      limitations:
        'Fresh bounded worker on this backend, not a separately provisioned OS or institutional HPC system. A different account is not proof of a different human. Imported reference authorship and checksums are not signatures. Matching outputs do not establish scientific validity.',
    };
  });
  app.post('/api/projects/:projectId/handovers/import', async (request, reply) => {
    const projectId = idParam(request, 'projectId');
    await access(request, projectId, true);
    const part = await request.file();
    if (!part) fail(400, 'Choose a handover JSON package');
    const bytes = await part.toBuffer();
    if (part.file.truncated || bytes.length > 3 * 1024 * 1024)
      fail(413, 'Handover packages must be at most 3 MiB');
    let raw: unknown;
    try {
      raw = JSON.parse(bytes.toString('utf8'));
    } catch {
      fail(400, 'The handover package must be valid JSON');
    }
    const parsed = portableSchema.parse(raw),
      { checksum, ...content } = parsed;
    if (digest(canonical(content)) !== checksum) fail(409, 'Package checksum failed');
    let input: Input | null = null,
      inputBytes: Buffer | undefined;
    if (content.input) {
      inputBytes = Buffer.from(content.input.contentBase64, 'base64');
      if (
        inputBytes.toString('base64') !== content.input.contentBase64 ||
        inputBytes.length !== content.input.bytes ||
        digest(inputBytes) !== content.input.sha256
      )
        fail(409, 'Package input checksum or size failed');
      const name = Array.from(
        content.input.name.normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Cs}\\/]/gu, '_'),
      )
        .slice(0, 180)
        .join('');
      input = {
        id: randomUUID(),
        storage_key: '',
        name,
        bytes: inputBytes.length,
        sha256: content.input.sha256,
      };
      input.storage_key = input.id;
    }
    if (
      (content.workflow === 'csv-summary' &&
        (!input || !input.name.toLowerCase().endsWith('.csv'))) ||
      (content.workflow === 'monte-carlo-pi' && input)
    )
      fail(400, 'Package inputs do not match the approved workflow');
    const approved = runSchema.parse({ ...content, inputFileId: input?.id });
    if (canonical(approved.parameters) !== canonical(content.parameters))
      fail(400, 'Package parameters must exactly match the approved workflow');
    const snapshot: Snapshot = {
        workflow: content.workflow,
        workflowVersion: content.workflowVersion,
        engineSha256: content.engineSha256,
        parameters: content.parameters,
        result: content.result,
        environment: content.environment,
        tolerance: content.tolerance,
        input,
        outputs: [],
      },
      id = randomUUID();
    let stored = false;
    try {
      await db.transaction(async (tx) => {
        await tx.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE', [projectId]);
        await access(request, projectId, true, false, tx);
        await capacity(tx, projectId);
        if (input && inputBytes) {
          const [{ total, count }] = await tx.query<{ total: number; count: number }>(
            'SELECT COALESCE(sum(bytes),0)::int AS total,count(*)::int AS count FROM files WHERE project_id=$1',
            [projectId],
          );
          if (total + input.bytes > 250 * 1024 * 1024 || count >= 500)
            fail(429, 'Project storage quota reached');
          await storage.put(input.storage_key, inputBytes);
          stored = true;
          await tx.query(
            "INSERT INTO files(id,project_id,name,storage_key,bytes,sha256,media_type,created_by) VALUES($1,$2,$3,$4,$5,$6,'text/csv',$7)",
            [
              input.id,
              projectId,
              input.name,
              input.storage_key,
              input.bytes,
              input.sha256,
              user(request).id,
            ],
          );
        }
        await tx.query(
          "INSERT INTO handovers(id,project_id,created_by,title,notes,snapshot,snapshot_hash,origin) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'imported')",
          [
            id,
            projectId,
            user(request).id,
            content.title,
            content.notes,
            JSON.stringify(snapshot),
            digest(canonical(snapshot)),
          ],
        );
        await audit(tx, projectId, user(request).id, 'handover.imported', { handoverId: id });
      });
    } catch (error) {
      if (stored && input) await storage.remove(input.storage_key);
      throw error;
    }
    reply.code(201);
    return { id };
  });
}
