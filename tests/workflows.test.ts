import test from 'node:test';
import assert from 'node:assert/strict';
import { runComputation } from '../server/runner.js';
import { runSchema } from '../shared/contracts.js';
import { readConfig } from '../server/config.js';

test('CSV uses actual quoted content and computes known descriptive statistics', async () => {
  const result = await runComputation(
    'csv-summary',
    { column: 'value' },
    'name,value\n"a,b",1\nb,2\nc,3\nd,4\ne,NA\n',
  );
  assert.equal(result.count, 4);
  assert.equal(result.mean, 2.5);
  assert.equal(result.median, 2.5);
  assert.equal(result.missing, 1);
  assert.equal(result.sample_standard_deviation, Math.sqrt(5 / 3));
});
test('CSV rejects invented columns, invalid values, duplicate headers, and malformed rows', async () => {
  await assert.rejects(
    runComputation('csv-summary', { column: 'other' }, 'value\n1\n'),
    /column does not exist/,
  );
  await assert.rejects(
    runComputation('csv-summary', { column: 'value' }, 'value\nhello\n'),
    /non-numeric/,
  );
  await assert.rejects(
    runComputation('csv-summary', { column: 'value' }, 'value,value\n1,2\n'),
    /unique/,
  );
  await assert.rejects(runComputation('csv-summary', { column: 'value' }, 'value\n1,2\n'));
});
test('long malformed numeric cells fail validation without ambiguous digit backtracking', async () => {
  await assert.rejects(
    runComputation('csv-summary', { column: 'value' }, `value\n${'9'.repeat(60000)}x\n`),
    /non-numeric/,
  );
});
test('single observation has no sample standard deviation', async () => {
  const result = await runComputation('csv-summary', { column: 'value' }, 'value\n2\n');
  assert.equal(result.sample_standard_deviation, null);
});
test('seeded Monte Carlo is deterministic and within a reference tolerance', async () => {
  const parameters = { samples: 100000, seed: 42 };
  const a = await runComputation('monte-carlo-pi', parameters, '');
  const b = await runComputation('monte-carlo-pi', parameters, '');
  assert.deepEqual(a, b);
  assert.ok(Math.abs(Number(a.estimate) - Math.PI) < 0.03);
});
test('execution supports cancellation and rejects unapproved workloads', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runComputation('monte-carlo-pi', { samples: 2000000, seed: 1 }, '', controller.signal),
    /cancelled/,
  );
  await assert.rejects(runComputation('shell', {}, ''), /Unsupported/);
});
test('request contracts bound resources and production configuration fails closed', () => {
  assert.equal(
    runSchema.safeParse({ workflow: 'monte-carlo-pi', parameters: { samples: 999999999, seed: 1 } })
      .success,
    false,
  );
  assert.throws(() => readConfig({ NODE_ENV: 'production' }), /Production requires/);
});
