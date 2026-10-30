import { mkdir, readFile, writeFile, unlink, readdir, lstat } from 'node:fs/promises';
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
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export function createStorage(config: Config): Storage {
  const validate = (key: string) => {
    if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid storage identifier');
    return key;
  };
  if (config.s3) {
    const client = new S3Client(config.s3);
    const bucket = config.s3.bucket;
    return {
      async *objects() {
        let continuationToken: string | undefined;
        do {
          const response = await client.send(
            new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
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
        );
      },
      async get(key) {
        const response = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: validate(key) }),
        );
        if (!response.Body) throw new Error('Artifact unavailable');
        return Buffer.from(await response.Body.transformToByteArray());
      },
      async remove(key) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: validate(key) }));
      },
    };
  }
  const directory = path.join(config.dataDir, 'objects');
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
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, validate(key)), data, { flag: 'wx', mode: 0o600 });
    },
    async get(key) {
      return readFile(path.join(directory, validate(key)));
    },
    async remove(key) {
      await unlink(path.join(directory, validate(key))).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== 'ENOENT') throw e;
      });
    },
  };
}
