import { z } from 'zod';

export function explainResult(runId: string, workflow: string, result: Record<string, unknown>) {
  let text: string;
  if (workflow === 'csv-summary') {
    const values = z
      .object({
        column: z.string(),
        count: z.number().int().positive(),
        missing: z.number().int().nonnegative(),
        mean: z.number(),
        median: z.number(),
        min: z.number(),
        max: z.number(),
        sample_standard_deviation: z.number().nullable(),
      })
      .parse(result);
    text = `The column "${values.column}" contains ${values.count} valid numeric observations (result.count); ${values.missing} missing observations were excluded (result.missing).\n\nThe mean is ${values.mean} (result.mean), and the median is ${values.median} (result.median). The observed values range from ${values.min} to ${values.max} (result.min, result.max).\n\n${values.sample_standard_deviation === null ? 'Sample standard deviation is undefined for a single observation.' : `The sample standard deviation is ${values.sample_standard_deviation}, calculated using n−1 (result.sample_standard_deviation).`}\n\nThese measurements retain the input column's units; units were not inferred. They describe the supplied data only and do not establish causation, statistical significance, or domain-specific scientific validity.`;
  } else if (workflow === 'monte-carlo-pi') {
    const values = z
      .object({
        samples: z.number().int().positive(),
        seed: z.number().int(),
        inside: z.number().int().nonnegative(),
        estimate: z.number(),
        reference: z.number(),
        absolute_error: z.number().nonnegative(),
      })
      .parse(result);
    text = `This seeded reference experiment used ${values.samples} samples and seed ${values.seed} (result.samples, result.seed). ${values.inside} sampled points fell inside the unit quarter-circle (result.inside).\n\nThe recorded estimate of π is ${values.estimate} (result.estimate). Against the recorded reference ${values.reference}, the absolute error is ${values.absolute_error} (result.reference, result.absolute_error).\n\nThe same implementation, seed, and sample count reproduce the pseudo-random experiment. Different seeds may change the estimate. A larger sample count does not guarantee a smaller error on every run. This is an educational reference workflow, not a domain-specific scientific solver.`;
  } else throw new Error('No evidence-report template exists for this workflow');
  return {
    runId,
    version: 'deterministic-evidence-v1',
    generator: 'Built-in evidence report',
    usesAi: false,
    text,
    evidence: result,
  };
}
