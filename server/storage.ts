import { mkdir, writeFile, unlink, readdir, lstat, open, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import { HttpError } from './errors.js';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type { Config } from './config.js';

export interface Storage {
  objects(): AsyncIterable<{ key: string; bytes: number; modifiedAt: Date | null }>;
  put(key: string, data: Buffer): Promise<void>;
  get(key: string, maxBytes?: number): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export function createStorage(config: Config): Storage {
  const validate = (key: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key))
      throw new HttpError(400, 'Invalid storage identifier');
    return key;
  };
  if (config.s3) {
    const client = new S3Client({
      ...config.s3,
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 },
    });
    const bucket = config.s3.bucket;
    return {
      async *objects() {
        let continuationToken: string | undefined;
        do {
          const response = await client.send(
            new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
            { abortSignal: AbortSignal.timeout(15000) },
          );
          for (const object of response.Contents || []) {
            if (object.Key && typeof object.Size === 'number')
              yield {
                key: object.Key,
                bytes: object.Size,
                modifiedAt: object.LastModified || null,
              };
          }
          continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
          if (response.IsTruncated && !continuationToken)
            throw new Error('Storage inventory returned an incomplete pagination token');
        } while (continuationToken);
      },
      async put(key, data) {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: validate(key),
            Body: data,
            ContentType: 'application/octet-stream',
          }),
          { abortSignal: AbortSignal.timeout(15000) },
        );
      },
      async get(key, maxBytes = config.maxUpload) {
        const limit = Math.min(maxBytes, config.maxUpload);
        if (!Number.isInteger(limit) || limit < 0)
          throw new HttpError(409, 'Invalid artifact size');
        const response = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: validate(key) }),
          { abortSignal: AbortSignal.timeout(15000) },
        );
        if (!response.Body) throw new Error('Artifact unavailable');
        const body = response.Body as AsyncIterable<Uint8Array> & { destroy?: () => void };
        if (response.ContentLength !== undefined && response.ContentLength > limit) {
          body.destroy?.();
          throw new HttpError(409, 'Artifact exceeds its allowed size');
        }
        const chunks: Buffer[] = [];
        let total = 0;
        const timeout = setTimeout(() => body.destroy?.(), 15000);
        try {
          for await (const chunk of body) {
            total += chunk.length;
            if (total > limit) {
              body.destroy?.();
              throw new HttpError(409, 'Artifact exceeds its allowed size');
            }
            chunks.push(Buffer.from(chunk));
          }
        } finally {
          clearTimeout(timeout);
        }
        return Buffer.concat(chunks, total);
      },
      async remove(key) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: validate(key) }), {
          abortSignal: AbortSignal.timeout(15000),
        });
      },
    };
  }
  const directory = path.join(config.dataDir, 'objects');
  async function privateDirectory() {
    await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
    if ((await lstat(config.dataDir)).isSymbolicLink())
      throw new HttpError(503, 'Unsafe storage directory');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if ((await lstat(directory)).isSymbolicLink())
      throw new HttpError(503, 'Unsafe storage directory');
    if (process.platform !== 'win32') {
      await chmod(config.dataDir, 0o700);
      await chmod(directory, 0o700);
    }
  }
  return {
    async *objects() {
      const entries = await readdir(directory, { withFileTypes: true }).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return [];
          throw error;
        },
      );
      for (const entry of entries) {
        if (!entry.isFile() || entry.isSymbolicLink()) continue;
        const stat = await lstat(path.join(directory, entry.name));
        if (stat.isFile() && !stat.isSymbolicLink())
          yield { key: entry.name, bytes: stat.size, modifiedAt: stat.mtime };
      }
    },
    async put(key, data) {
      await privateDirectory();
      await writeFile(path.join(directory, validate(key)), data, { flag: 'wx', mode: 0o600 });
    },
    async get(key, maxBytes = config.maxUpload) {
      const limit = Math.min(maxBytes, config.maxUpload),
        target = path.join(directory, validate(key));
      if (!Number.isInteger(limit) || limit < 0) throw new HttpError(409, 'Invalid artifact size');
      if (
        (await lstat(config.dataDir)).isSymbolicLink() ||
        (await lstat(directory)).isSymbolicLink()
      )
        throw new HttpError(409, 'Unsafe artifact object');
      const handle = await open(
        target,
        constants.O_RDONLY |
          (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK),
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ELOOP') throw new HttpError(409, 'Unsafe artifact object');
        throw error;
      });
      try {
        const stat = await handle.stat({ bigint: true }),
          named = await lstat(target, { bigint: true });
        if (
          named.isSymbolicLink() ||
          stat.dev !== named.dev ||
          stat.ino !== named.ino ||
          stat.nlink !== 1n
        )
          throw new HttpError(409, 'Unsafe artifact object');
        if (!stat.isFile() || stat.size > BigInt(limit))
          throw new HttpError(409, 'Artifact exceeds its allowed size or is not a regular file');
        const chunks: Buffer[] = [];
        let total = 0;
        while (true) {
          const chunk = Buffer.alloc(Math.min(65536, limit - total + 1));
          const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
          if (!bytesRead) break;
          total += bytesRead;
          if (total > limit) throw new HttpError(409, 'Artifact exceeds its allowed size');
          chunks.push(chunk.subarray(0, bytesRead));
        }
        return Buffer.concat(chunks, total);
      } finally {
        await handle.close();
      }
    },
    async remove(key) {
      await unlink(path.join(directory, validate(key))).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== 'ENOENT') throw e;
      });
    },
  };
}
