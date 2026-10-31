import { randomUUID } from 'node:crypto';
import type { Database } from './db.js';
import { digest, token } from './security.js';
import { z } from 'zod';

export async function issueEnrollment(db: Database, rawEmail: string) {
  const email = z.email().max(254).parse(rawEmail).toLowerCase(),
    code = token();
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM enrollment_tokens WHERE email=$1 OR expires_at<now()', [email]);
    await tx.query(
      `INSERT INTO enrollment_tokens(id,token_hash,email,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')`,
      [randomUUID(), digest(code), email],
    );
  });
  return { email, code, expiresInHours: 24 };
}
export async function approveExistingAccount(db: Database, rawEmail: string) {
  const email = z.email().max(254).parse(rawEmail).toLowerCase();
  return db.transaction(async (tx) => {
    const [account] = await tx.query<{ id: string }>(
      'UPDATE users SET access_approved_at=now() WHERE email=$1 RETURNING id',
      [email],
    );
    if (!account) throw new Error('No existing account matches this email');
    await tx.query('INSERT INTO account_events(id,user_id,action) VALUES($1,$2,$3)', [
      randomUUID(),
      account.id,
      'access.operator_approved',
    ]);
    return { approved: true };
  });
}
