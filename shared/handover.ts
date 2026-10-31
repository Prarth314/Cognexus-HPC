import { z } from 'zod';
export const toleranceSchema = z
  .object({
    absolute: z.number().finite().min(0).max(0.001).default(0),
    relative: z.number().finite().min(0).max(0.001).default(0),
  })
  .strict();
export type Tolerance = z.infer<typeof toleranceSchema>;
export const resultSchema = z
  .record(z.string().max(100), z.union([z.string().max(4000), z.number().finite(), z.null()]))
  .refine(
    (value) =>
      Object.keys(value).length <= 64 &&
      !Object.keys(value).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key)),
    'Unsupported reference result',
  );
export const environmentSchema = z
  .object({
    nodeVersion: z.string().max(80),
    platform: z.string().max(80),
    architecture: z.string().max(80),
    revision: z.string().max(100),
  })
  .strict();
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const portableSchema = z
  .object({
    format: z.literal('cognexus-handover'),
    schemaVersion: z.literal(1),
    title: z.string().trim().min(2).max(120),
    notes: z.string().trim().max(4000),
    workflow: z.enum(['csv-summary', 'monte-carlo-pi']),
    workflowVersion: z.literal('1.0.0'),
    engineSha256: hashSchema,
    parameters: z
      .record(z.string().max(100), z.union([z.number().finite(), z.string().max(128)]))
      .refine((value) => Object.keys(value).length <= 4),
    result: resultSchema,
    environment: environmentSchema,
    tolerance: toleranceSchema,
    input: z
      .object({
        name: z.string().max(180),
        bytes: z
          .number()
          .int()
          .min(1)
          .max(2 * 1024 * 1024),
        sha256: hashSchema,
        contentBase64: z
          .string()
          .max(2800000)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      })
      .strict()
      .nullable(),
    checksum: hashSchema,
  })
  .strict();
export interface HandoverSummary {
  id: string;
  title: string;
  notes: string;
  created_at: string;
  source_run_id: string | null;
  origin: 'native' | 'imported';
  checks: number;
  workflow: string;
}
export interface ComparisonField {
  path: string;
  expected: string | number | null;
  actual: string | number | null;
  matches: boolean;
  allowedDifference: number | null;
}
export interface HandoverCheck {
  id: string;
  runId: string;
  createdAt: string;
  verifier: string;
  independent: boolean;
  status: string;
  fields: ComparisonField[];
  environmentDifferences: string[];
  error: string | null;
}
export interface HandoverDetail extends HandoverSummary {
  reference: Record<string, unknown>;
  preflight: { ready: boolean; checks: { label: string; ok: boolean; message: string }[] };
  verifications: HandoverCheck[];
}
