import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { HttpError } from './errors.js';
export function permitsOrigin(value: string, configured: string, production: boolean) {
  if (value === configured) return true;
  if (production) return false;
  try {
    const candidate = new URL(value),
      expected = new URL(configured),
      loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
    return (
      candidate.origin === value &&
      loopback.has(candidate.hostname) &&
      loopback.has(expected.hostname) &&
      candidate.protocol === expected.protocol &&
      candidate.port === expected.port
    );
  } catch {
    return false;
  }
}

let active = 0;
const waiters: (() => void)[] = [];
async function derive(password: string, salt: string, legacy = false): Promise<Buffer> {
  if (active >= 2) {
    if (waiters.length >= 4) throw new HttpError(429, 'Authentication is busy; retry shortly');
    await new Promise<void>((resolve) => waiters.push(resolve));
  } else active++;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scryptCallback(
        password,
        salt,
        64,
        { N: legacy ? 16384 : 32768, r: 8, p: legacy ? 1 : 3, maxmem: 64 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      ),
    );
  } finally {
    const next = waiters.shift();
    if (next) next();
    else active--;
  }
}
export const token = () => randomBytes(32).toString('hex');
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt-v2:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [version, salt, encoded, ...extra] = stored.split(':');
  if (
    extra.length ||
    !['scrypt', 'scrypt-v2'].includes(version) ||
    !salt ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !encoded ||
    !/^[a-f0-9]{128}$/.test(encoded)
  )
    return false;
  const key = await derive(password, salt, version === 'scrypt');
  const expected = Buffer.from(encoded, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}
export const needsPasswordUpgrade = (stored: string) => !stored.startsWith('scrypt-v2:');
export const safeErrorCode = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,50}$/.test(code) ? code : 'INTERNAL_ERROR';
};
export function safeEqual(a: string, b: string) {
  return timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
}
