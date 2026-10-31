import { readFileSync } from 'node:fs';
import { digest } from './security.js';
import { resultSchema, type ComparisonField, type Tolerance } from '../shared/handover.js';
const normalizedSource = (url: URL) => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');
export const engineSha256 = digest(
  canonical({
    workflow: digest(normalizedSource(new URL('./compute.mjs', import.meta.url))),
    csvParser: digest(normalizedSource(new URL(import.meta.resolve('csv-parse/sync')))),
  }),
);
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
      .join(',') +
    '}'
  );
}
export function compareResults(
  expected: unknown,
  actual: unknown,
  tolerance: Tolerance,
): ComparisonField[] {
  const left = resultSchema.parse(expected),
    right = resultSchema.parse(actual);
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().map((path) => {
    const a = left[path],
      b = right[path];
    let allowedDifference: number | null = null;
    if (typeof a === 'number' && typeof b === 'number')
      allowedDifference = Number.isInteger(a)
        ? 0
        : Math.max(tolerance.absolute, tolerance.relative * Math.abs(a));
    return {
      path,
      expected: a ?? null,
      actual: b ?? null,
      allowedDifference,
      matches:
        Object.hasOwn(left, path) &&
        Object.hasOwn(right, path) &&
        (allowedDifference === null
          ? a === b
          : Math.abs((a as number) - (b as number)) <= allowedDifference),
    };
  });
}
export function currentEnvironment() {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    revision: process.env.APP_REVISION || 'unrecorded',
  };
}
