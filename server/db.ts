import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { mkdir, chmod } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from './config.js';

export interface Database {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function openDatabase(
  config: Pick<Config, 'databaseUrl' | 'dataDir'> & Partial<Pick<Config, 'production'>>,
  memory = false,
): Promise<Database> {
  if (config.databaseUrl) {
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: 10,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
      idleTimeoutMillis: 30000,
    });
    if (config.production) {
      try {
        const { rows } = await pool.query(
          'SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname=current_user',
        );
        if (!rows.length || Object.values(rows[0]).some(Boolean))
          throw new Error(
            'Production database role must not have superuser, role-creation, database-creation, or replication privileges',
          );
      } catch (error) {
        await pool.end();
        throw error;
      }
    }
    const wrap = (client: pg.Pool | pg.PoolClient): Database => ({
      async query<T>(sql: string, params: unknown[] = []) {
        return (await client.query(sql, params)).rows as T[];
      },
      async transaction<T>(fn: (db: Database) => Promise<T>) {
        const connection = await pool.connect();
        try {
          await connection.query('BEGIN');
          const result = await fn(wrap(connection));
          await connection.query('COMMIT');
          return result;
        } catch (e) {
          await connection.query('ROLLBACK');
          throw e;
        } finally {
          connection.release();
        }
      },
      async close() {
        await pool.end();
      },
    });
    return wrap(pool);
  }
  if (!memory) {
    await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') await chmod(config.dataDir, 0o700);
  }
  const embedded = new PGlite(memory ? undefined : path.join(config.dataDir, 'db'));
  const wrap = (client: Pick<PGlite, 'query'>): Database => ({
    async query<T>(sql: string, params: unknown[] = []) {
      return (await client.query<T>(sql, params)).rows;
    },
    async transaction<T>(fn: (db: Database) => Promise<T>) {
      return embedded.transaction((tx) => fn(wrap(tx as unknown as PGlite)));
    },
    async close() {
      await embedded.close();
    },
  });
  return wrap(embedded);
}

export async function migrate(db: Database) {
  await db.transaction(async (tx) => {
    // The transaction-scoped lock serializes migrations across PostgreSQL replicas.
    await tx.query('SELECT pg_advisory_xact_lock(736281)');
    await tx.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const applied = await tx.query('SELECT version FROM schema_migrations WHERE version=1');
    if (!applied.length) {
      const statements = [
        `CREATE TABLE users (id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
        `CREATE TABLE sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL)`,
        `CREATE TABLE projects (id uuid PRIMARY KEY, name text NOT NULL, description text NOT NULL, domain text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
        `CREATE TABLE memberships (project_id uuid REFERENCES projects(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id) ON DELETE CASCADE, role text NOT NULL CHECK(role IN ('owner','collaborator','viewer')), PRIMARY KEY(project_id,user_id))`,
        `CREATE TABLE files (id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), name text NOT NULL, storage_key text NOT NULL UNIQUE, bytes integer NOT NULL CHECK(bytes >= 0), sha256 text NOT NULL, media_type text NOT NULL, source_run_id uuid, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now())`,
        `CREATE TABLE runs (id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), created_by uuid NOT NULL REFERENCES users(id), workflow text NOT NULL, parameters jsonb NOT NULL, input_file_id uuid REFERENCES files(id), input_snapshot jsonb, manifest jsonb NOT NULL, status text NOT NULL CHECK(status IN ('queued','running','succeeded','failed','cancelled')), validation_status text NOT NULL DEFAULT 'pending' CHECK(validation_status IN ('pending','valid','invalid')), result jsonb, error text, logs text NOT NULL DEFAULT '', idempotency_key text NOT NULL, request_hash text NOT NULL, attempt integer NOT NULL DEFAULT 0, lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz, UNIQUE(project_id,created_by,idempotency_key))`,
        `ALTER TABLE files ADD CONSTRAINT files_source_run_fk FOREIGN KEY(source_run_id) REFERENCES runs(id)`,
        `CREATE TABLE invitations (id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), token_hash text NOT NULL UNIQUE, email text NOT NULL, role text NOT NULL CHECK(role IN ('collaborator','viewer')), expires_at timestamptz NOT NULL, accepted_at timestamptz, created_by uuid NOT NULL REFERENCES users(id))`,
        `CREATE TABLE audit_events (id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now())`,
        `CREATE TABLE analyses (id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES runs(id), created_by uuid NOT NULL REFERENCES users(id), question text NOT NULL, answer text NOT NULL, model text NOT NULL, prompt_version text NOT NULL, evidence jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
        `CREATE INDEX runs_claim_idx ON runs(status,created_at)`,
        `CREATE INDEX files_project_idx ON files(project_id,created_at)`,
        `CREATE INDEX audit_project_idx ON audit_events(project_id,created_at)`,
        `CREATE INDEX sessions_expiry_idx ON sessions(expires_at)`,
        `INSERT INTO schema_migrations(version) VALUES(1)`,
      ];
      for (const statement of statements) await tx.query(statement);
    }
    const upgraded = await tx.query('SELECT version FROM schema_migrations WHERE version=2');
    if (!upgraded.length) {
      const statements = [
        `ALTER TABLE sessions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid()`,
        `ALTER TABLE sessions ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()`,
        `CREATE UNIQUE INDEX sessions_id_idx ON sessions(id)`,
        `CREATE TABLE recovery_codes (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz)`,
        `CREATE INDEX recovery_user_idx ON recovery_codes(user_id)`,
        `CREATE TABLE account_events (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
        `CREATE INDEX account_events_user_idx ON account_events(user_id,created_at)`,
        `ALTER TABLE projects ADD COLUMN archived_at timestamptz`,
        `INSERT INTO schema_migrations(version) VALUES(2)`,
      ];
      for (const statement of statements) await tx.query(statement);
    }
    const secured = await tx.query('SELECT version FROM schema_migrations WHERE version=3');
    if (!secured.length) {
      for (const sql of [
        `ALTER TABLE users ADD COLUMN access_approved_at timestamptz`,
        `CREATE TABLE enrollment_tokens (id uuid PRIMARY KEY,token_hash text NOT NULL UNIQUE,email text NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz)`,
        `CREATE INDEX enrollment_email_idx ON enrollment_tokens(email,expires_at)`,
        `INSERT INTO schema_migrations(version) VALUES(3)`,
      ])
        await tx.query(sql);
    }
    if (!(await tx.query('SELECT version FROM schema_migrations WHERE version=4')).length) {
      for (const sql of [
        `CREATE TABLE handovers(id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES projects(id),source_run_id uuid REFERENCES runs(id),created_by uuid NOT NULL REFERENCES users(id),reference_author uuid REFERENCES users(id),title text NOT NULL,notes text NOT NULL,snapshot jsonb NOT NULL,snapshot_hash text NOT NULL,origin text NOT NULL CHECK(origin IN ('native','imported')),created_at timestamptz NOT NULL DEFAULT now())`,
        `CREATE INDEX handovers_project_idx ON handovers(project_id,created_at)`,
        `CREATE TABLE handover_checks(id uuid PRIMARY KEY,handover_id uuid NOT NULL REFERENCES handovers(id),run_id uuid NOT NULL UNIQUE REFERENCES runs(id),created_by uuid NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(handover_id,created_by,idempotency_key))`,
        `INSERT INTO schema_migrations(version) VALUES(4)`,
      ])
        await tx.query(sql);
    }
  });
}
