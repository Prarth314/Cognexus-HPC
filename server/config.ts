import path from 'node:path';
import { z } from 'zod';

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  function parseUrl(value: string, label: string) {
    try {
      return new URL(value);
    } catch {
      throw new Error(`${label} must be a valid URL`);
    }
  }
  const origin = parseUrl(env.PUBLIC_ORIGIN || 'http://localhost:3000', 'PUBLIC_ORIGIN');
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    !['http:', 'https:'].includes(origin.protocol)
  )
    throw new Error('PUBLIC_ORIGIN must be a bare HTTP(S) origin without credentials');
  const dataDir = path.resolve(env.DATA_DIR || '.data');
  const projectRelative = path.relative(dataDir, process.cwd());
  if (
    dataDir === path.parse(dataDir).root ||
    !projectRelative ||
    (!projectRelative.startsWith('..' + path.sep) &&
      projectRelative !== '..' &&
      !path.isAbsolute(projectRelative)) ||
    ['dist', 'public'].some((folder) => {
      const relative = path.relative(path.resolve(folder), dataDir);
      return (
        !relative ||
        (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
      );
    })
  )
    throw new Error('DATA_DIR must be a private directory outside public/static roots');
  if (production && (origin.protocol !== 'https:' || !env.DATABASE_URL)) {
    throw new Error(
      'Production requires HTTPS PUBLIC_ORIGIN and DATABASE_URL; registration uses email-bound operator enrollment.',
    );
  }
  if (env.S3_BUCKET && !env.S3_REGION) throw new Error('S3_REGION is required with S3_BUCKET.');
  if (env.S3_ENDPOINT) {
    const endpoint = parseUrl(env.S3_ENDPOINT, 'S3_ENDPOINT');
    if (
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      !['http:', 'https:'].includes(endpoint.protocol) ||
      (production && endpoint.protocol !== 'https:')
    )
      throw new Error(
        'S3_ENDPOINT must use HTTPS in production and contain no embedded credentials',
      );
  }
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
    dataDir,
    databaseUrl: env.DATABASE_URL,
    signupCode: env.SIGNUP_CODE,
    aiKey: env.GEMINI_API_KEY,
    aiModel: env.GEMINI_MODEL,
    allowExternalAi: env.ALLOW_EXTERNAL_AI === 'true',
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
