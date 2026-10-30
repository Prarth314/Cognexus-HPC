// Approved pure workloads only. Runs in a bounded worker thread, never a shell.
import { parentPort, workerData } from 'node:worker_threads';
import { parse } from 'csv-parse/sync';

export function executeWorkflow(workflow, parameters, input = '') {
  if (workflow === 'monte-carlo-pi') {
    const { samples, seed } = parameters;
    if (
      !Number.isInteger(samples) ||
      samples < 1000 ||
      samples > 2_000_000 ||
      !Number.isInteger(seed) ||
      seed < 1 ||
      seed > 2_147_483_646
    )
      throw new Error('Invalid bounded Monte Carlo parameters');
    let state = seed;
    const random = () => {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    };
    let inside = 0;
    for (let i = 0; i < samples; i++) {
      const x = random(),
        y = random();
      if (x * x + y * y <= 1) inside++;
    }
    const estimate = (4 * inside) / samples;
    return {
      kind: workflow,
      samples,
      seed,
      inside,
      estimate,
      absolute_error: Math.abs(estimate - Math.PI),
      reference: Math.PI,
      units: 'dimensionless',
      limitations:
        'Educational pseudo-random sampling reference. Accuracy varies with seed and sample count; this is not a domain-specific solver.',
    };
  }
  if (workflow !== 'csv-summary') throw new Error('Unsupported workflow');
  let headers = [];
  const records = parse(input, {
    bom: true,
    skip_empty_lines: true,
    max_record_size: 65536,
    to: 100002,
    columns(values) {
      if (
        new Set(values).size !== values.length ||
        values.some((v) => !v.trim() || ['__proto__', 'constructor', 'prototype'].includes(v))
      )
        throw new Error('CSV headers must be non-empty, unique, and safe property names');
      headers = values;
      return values;
    },
  });
  if (!headers.includes(parameters.column))
    throw new Error('Selected column does not exist in the CSV');
  if (records.length > 100000) throw new Error('CSV exceeds 100,000-row workflow limit');
  const values = [];
  let missing = 0,
    mean = 0,
    m2 = 0;
  for (const record of records) {
    const raw = record[parameters.column].trim();
    if (!raw || /^(na|null|nan)$/i.test(raw)) {
      missing++;
      continue;
    }
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw))
      throw new Error('Selected column contains non-numeric values');
    const value = Number(raw);
    if (!Number.isFinite(value) || Math.abs(value) > 1e100)
      throw new Error('Values must be finite and within ±1e100');
    values.push(value);
    const delta = value - mean;
    mean += delta / values.length;
    m2 += delta * (value - mean);
  }
  if (!values.length) throw new Error('Selected column has no valid numeric observations');
  values.sort((a, b) => a - b);
  const n = values.length;
  return {
    kind: workflow,
    column: parameters.column,
    rows: records.length,
    count: n,
    missing,
    mean,
    median: n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2,
    min: values[0],
    max: values[n - 1],
    sample_standard_deviation: n > 1 ? Math.sqrt(Math.max(0, m2 / (n - 1))) : null,
    units: 'Same units as input; units are not inferred',
    limitations:
      'Descriptive statistics only. No causal interpretation, inferential significance, or scientific validity is established. Missing values excluded; sample standard deviation uses n−1.',
  };
}

if (parentPort) {
  try {
    parentPort.postMessage({
      ok: true,
      result: executeWorkflow(workerData.workflow, workerData.parameters, workerData.input),
    });
  } catch (error) {
    parentPort.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Execution failed',
    });
  }
}
