import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from './db.js';
import type { User } from '../shared/contracts.js';
import { digest, hashPassword, verifyPassword } from './security.js';
import { fail } from './errors.js';

const password = z.string().min(12).max(128);
const currentPasswordSchema = z.object({ currentPassword: z.string().min(1).max(128) });
const sensitiveRate = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } };

export function registerAccountRoutes(
  app: FastifyInstance,
  options: {
    db: Database;
    cookieName: string;
    user: (request: FastifyRequest) => User;
    session: (reply: FastifyReply, user: User, connection?: Database) => Promise<void>;
  },
) {
  const { db, user, cookieName, session } = options;
  const record = async (tx: Database, id: string, action: string) => {
    await tx.query('INSERT INTO account_events(id,user_id,action) VALUES($1,$2,$3)', [
      randomUUID(),
      id,
      action,
    ]);
  };
  async function reauthenticate(tx: Database, request: FastifyRequest, currentPassword: string) {
    const principal = user(request);
    const [account] = await tx.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',
      [principal.id],
    );
    if (!account || !(await verifyPassword(currentPassword, account.password_hash)))
      fail(401, 'Current password is incorrect');
    // Recheck the session inside the identity lock: password reset may have revoked it.
    const [valid] = await tx.query(
      'SELECT id FROM sessions WHERE token_hash=$1 AND user_id=$2 AND expires_at>now()',
      [digest(request.cookies[cookieName] || ''), principal.id],
    );
    if (!valid) fail(401, 'Session has expired; sign in again');
    return principal;
  }
  app.get('/api/account/security', async (request) => {
    const principal = user(request),
      hash = digest(request.cookies[cookieName] || '');
    const sessions = await db.query<{
      id: string;
      created_at: string;
      expires_at: string;
      current: boolean;
    }>(
      'SELECT id,created_at,expires_at,(token_hash=$2) AS current FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC',
      [principal.id, hash],
    );
    const [{ remaining }] = await db.query<{ remaining: number }>(
      'SELECT count(*)::int AS remaining FROM recovery_codes WHERE user_id=$1 AND consumed_at IS NULL',
      [principal.id],
    );
    const events = await db.query(
      'SELECT id,action,created_at FROM account_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',
      [principal.id],
    );
    return { sessions, recoveryCodesRemaining: remaining, events, emailVerified: false };
  });
  app.patch('/api/account/profile', async (request) => {
    const principal = user(request),
      body = z.object({ name: z.string().trim().min(2).max(100) }).parse(request.body);
    await db.transaction(async (tx) => {
      await tx.query('UPDATE users SET name=$2 WHERE id=$1', [principal.id, body.name]);
      await record(tx, principal.id, 'profile.updated');
    });
    return { user: { ...principal, name: body.name } };
  });
  app.post('/api/account/password', sensitiveRate, async (request, reply) => {
    const body = currentPasswordSchema.extend({ newPassword: password }).parse(request.body);
    const principal = await db.transaction(async (tx) => {
      const principal = await reauthenticate(tx, request, body.currentPassword);
      const hash = await hashPassword(body.newPassword);
      await tx.query('UPDATE users SET password_hash=$2 WHERE id=$1', [principal.id, hash]);
      await tx.query('DELETE FROM sessions WHERE user_id=$1', [principal.id]);
      await record(tx, principal.id, 'password.changed');
      // Rotate the current cookie only after invalidating every previous session.
      await session(reply, principal, tx);
      return principal;
    });
    return { user: principal };
  });
  app.post('/api/account/recovery-codes', sensitiveRate, async (request) => {
    const body = currentPasswordSchema.parse(request.body);
    const codes = Array.from({ length: 8 }, () => randomBytes(16).toString('hex'));
    await db.transaction(async (tx) => {
      const principal = await reauthenticate(tx, request, body.currentPassword);
      await tx.query('DELETE FROM recovery_codes WHERE user_id=$1', [principal.id]);
      for (const code of codes)
        await tx.query('INSERT INTO recovery_codes(token_hash,user_id) VALUES($1,$2)', [
          digest(code),
          principal.id,
        ]);
      await record(tx, principal.id, 'recovery_codes.regenerated');
    });
    return {
      codes,
      notice:
        'Save these codes offline. They are shown once; generating another set invalidates this set.',
    };
  });
  app.post(
    '/api/auth/recover',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request) => {
      const body = z
        .object({
          email: z.email().transform((v) => v.toLowerCase()),
          code: z.string().regex(/^[a-f0-9]{32}$/),
          newPassword: password,
        })
        .parse(request.body);
      const nextHash = await hashPassword(body.newPassword);
      await db.transaction(async (tx) => {
        const [account] = await tx.query<{ id: string }>(
          'SELECT id FROM users WHERE email=$1 FOR UPDATE',
          [body.email],
        );
        if (!account) fail(400, 'Recovery details are invalid or already used');
        const [code] = await tx.query(
          'UPDATE recovery_codes SET consumed_at=now() WHERE user_id=$1 AND token_hash=$2 AND consumed_at IS NULL RETURNING token_hash',
          [account.id, digest(body.code)],
        );
        if (!code) fail(400, 'Recovery details are invalid or already used');
        await tx.query('UPDATE users SET password_hash=$2 WHERE id=$1', [account.id, nextHash]);
        await tx.query('DELETE FROM sessions WHERE user_id=$1', [account.id]);
        await record(tx, account.id, 'password.recovered');
      });
      return {
        ok: true,
        notice:
          'Password reset. All previous sessions were revoked. Sign in with your new password.',
      };
    },
  );
  app.delete('/api/account/sessions/:sessionId', async (request) => {
    const principal = user(request),
      id = z.uuid().parse((request.params as { sessionId: string }).sessionId);
    await db.transaction(async (tx) => {
      const removed = await tx.query(
        'DELETE FROM sessions WHERE id=$1 AND user_id=$2 RETURNING id',
        [id, principal.id],
      );
      if (!removed.length) fail(404, 'Session not found');
      await record(tx, principal.id, 'session.revoked');
    });
    return { ok: true };
  });
  app.post('/api/account/sessions/revoke-others', sensitiveRate, async (request) => {
    const body = currentPasswordSchema.parse(request.body);
    await db.transaction(async (tx) => {
      const principal = await reauthenticate(tx, request, body.currentPassword);
      await tx.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [
        principal.id,
        digest(request.cookies[cookieName] || ''),
      ]);
      await record(tx, principal.id, 'sessions.others_revoked');
    });
    return { ok: true };
  });
  app.get('/api/account/export', async (request, reply) => {
    const principal = user(request);
    const memberships = await db.query(
      'SELECT p.id,p.name,p.description,p.domain,p.archived_at,m.role FROM memberships m JOIN projects p ON p.id=m.project_id WHERE m.user_id=$1',
      [principal.id],
    );
    const events = await db.query(
      'SELECT action,created_at FROM account_events WHERE user_id=$1 ORDER BY created_at',
      [principal.id],
    );
    reply.header('Content-Disposition', 'attachment; filename="cognexus-account.json"');
    return {
      format: 'Cognexus account metadata export',
      exportedAt: new Date().toISOString(),
      user: principal,
      memberships,
      securityEvents: events,
      scope:
        'Account metadata and current project memberships only. Use each run manifest and authorized artifact downloads to export research evidence. Passwords, session secrets, and recovery codes are excluded.',
    };
  });
}
