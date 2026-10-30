import { z } from 'zod';

export const roleSchema = z.enum(['owner', 'collaborator', 'viewer']);
export type Role = z.infer<typeof roleSchema>;
export const projectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(''),
  domain: z.string().trim().max(80).default('Computational research'),
});
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12).max(128),
  signupCode: z.string().max(256).optional(),
});
export const loginSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const runSchema = z.discriminatedUnion('workflow', [
  z.object({
    workflow: z.literal('csv-summary'),
    inputFileId: z.uuid(),
    parameters: z.object({ column: z.string().trim().min(1).max(128) }),
  }),
  z.object({
    workflow: z.literal('monte-carlo-pi'),
    parameters: z.object({
      samples: z.number().int().min(1000).max(2_000_000),
      seed: z.number().int().min(1).max(2_147_483_646),
    }),
  }),
]);
export type RunRequest = z.infer<typeof runSchema>;
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export interface User {
  id: string;
  name: string;
  email: string;
}
export interface Project {
  archived_at: string | null;
  id: string;
  name: string;
  description: string;
  domain: string;
  role: Role;
  created_at: string;
  members: number;
}
export interface StoredFile {
  id: string;
  project_id: string;
  name: string;
  bytes: number;
  sha256: string;
  media_type: string;
  created_at: string;
  source_run_id: string | null;
}
export interface Run {
  id: string;
  project_id: string;
  workflow: RunRequest['workflow'];
  status: JobStatus;
  parameters: Record<string, string | number>;
  input_file_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  logs: string;
  validation_status: 'pending' | 'valid' | 'invalid';
  attempt: number;
}
export const WORKFLOWS = [
  {
    id: 'csv-summary',
    name: 'Dataset statistics',
    description:
      'Compute descriptive statistics for a numeric CSV column. Missing values are counted; invalid numeric values fail validation.',
    version: '1.0.0',
    execution: 'Local CPU worker',
    maxSeconds: 30,
  },
  {
    id: 'monte-carlo-pi',
    name: 'Seeded Monte Carlo',
    description:
      'Estimate π using a bounded, reproducible sampling experiment. An educational reference workflow, not a domain-specific scientific solver.',
    version: '1.0.0',
    execution: 'Local CPU worker',
    maxSeconds: 30,
  },
] as const;
