import path from 'node:path';
import { z } from 'zod';

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const origin = new URL(env.PUBLIC_ORIGIN || 'http://localhost:3000');
  if (
    production &&
    (origin.protocol !== 'https:' ||
      !env.DATABASE_URL ||
      !env.SIGNUP_CODE ||
      env.SIGNUP_CODE.length < 24)
  ) {
    throw new Error(
      'Production requires HTTPS PUBLIC_ORIGIN, DATABASE_URL, and SIGNUP_CODE of at least 24 characters.',
    );
  }
  if (env.S3_BUCKET && !env.S3_REGION) throw new Error('S3_REGION is required with S3_BUCKET.');
  if (env.OPERATIONS_TOKEN && env.OPERATIONS_TOKEN.length < 32)
    throw new Error('OPERATIONS_TOKEN must have at least 32 characters');
  return {
    production,
    origin: origin.origin,
    port: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.PORT || '3001'),
    dataDir: path.resolve(env.DATA_DIR || '.data'),
    databaseUrl: env.DATABASE_URL,
    signupCode: env.SIGNUP_CODE,
    aiKey: env.GEMINI_API_KEY,
    aiModel: env.GEMINI_MODEL,
    operationsToken: env.OPERATIONS_TOKEN,
    s3: env.S3_BUCKET
      ? {
          bucket: env.S3_BUCKET,
          region: env.S3_REGION!,
          endpoint: env.S3_ENDPOINT,
          forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
        }
      : undefined,
    maxUpload: 10 * 1024 * 1024,
    sessionSeconds: 60 * 60 * 24 * 7,
  };
}
export type Config = ReturnType<typeof readConfig>;
