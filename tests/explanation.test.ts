import test from 'node:test';
import assert from 'node:assert/strict';
import { explainResult } from '../server/explanation.js';
import { readConfig } from '../server/config.js';

test('free reports explain actual CSV evidence without a provider', () => {
  const evidence = {
    column: 'temperature',
    count: 4,
    missing: 1,
    mean: 2.5,
    median: 2.5,
    min: 1,
    max: 4,
    sample_standard_deviation: 1.2909944487358056,
  };
  const report = explainResult('recorded-run', 'csv-summary', evidence);
  assert.equal(report.usesAi, false);
  assert.equal(report.runId, 'recorded-run');
  assert.deepEqual(report.evidence, evidence);
  assert.match(report.text, /mean is 2.5 \(result.mean\)/);
  assert.match(report.text, /units were not inferred/);
});
test('Monte Carlo explanation preserves error and reproducibility limitations', () => {
  const report = explainResult('pi-run', 'monte-carlo-pi', {
    samples: 1000,
    seed: 42,
    inside: 787,
    estimate: 3.148,
    reference: Math.PI,
    absolute_error: Math.abs(3.148 - Math.PI),
  });
  assert.match(report.text, /does not guarantee/);
  assert.match(report.text, /result.absolute_error/);
  assert.equal(report.usesAi, false);
});
test('incomplete evidence is rejected rather than generating invented measurements', () => {
  assert.throws(() => explainResult('bad', 'csv-summary', { mean: 2.5 }));
  assert.throws(() => explainResult('bad', 'unknown', {}), /No evidence-report/);
});
test('provider credentials alone never opt into external AI calls', () => {
  assert.equal(
    readConfig({ GEMINI_API_KEY: 'configured-key', GEMINI_MODEL: 'configured-model' })
      .allowExternalAi,
    false,
  );
  assert.equal(readConfig({ ALLOW_EXTERNAL_AI: 'false' }).allowExternalAi, false);
});
