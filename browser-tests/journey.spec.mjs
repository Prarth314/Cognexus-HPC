import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startServer } from '../scripts/lib/pilot-runtime.mjs';
let directory, server;
test.beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'cognexus-browser-'));
  server = await startServer(directory);
});
test.afterAll(async () => {
  await server?.stop();
  if (directory) {
    expect(path.relative(os.tmpdir(), directory)).toMatch(/^cognexus-browser-[^\\/]+$/);
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
async function accessible(page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) })),
  ).toEqual([]);
}
test('built CSV investigation, provenance, reproducible handover and downloadable report', async ({
  page,
}) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(server.url);
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Your name').fill('Synthetic browser researcher');
  await page.getByLabel('Email address').fill(randomUUID() + '@example.test');
  await page.getByLabel('Password', { exact: true }).fill(randomUUID());
  await accessible(page);
  const registration = page.waitForResponse((response) =>
    response.url().endsWith('/api/auth/register'),
  );
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const registered = await registration;
  expect(registered.status(), await registered.text()).toBe(201);
  await page.getByRole('button', { name: 'Create a project', exact: true }).click();
  const projectDialog = page.getByRole('dialog');
  await projectDialog.getByLabel('Project name').fill('Synthetic browser investigation');
  await projectDialog.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByRole('button', { name: 'Files & artifacts' }).click();
  await page.getByLabel('Upload file', { exact: true }).setInputFiles({
    name: 'browser.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('value,label\n1,a\n2,b\n3,c\n4,d\n'),
  });
  await expect(page.getByRole('button', { name: /browser.csv/ })).toBeVisible();
  await expect(page.getByText(/Version [a-f0-9]{8}/)).toBeVisible();
  await page.getByRole('button', { name: /browser.csv/ }).click();
  await expect(page.getByRole('dialog')).toContainText('value');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Experiments', exact: true }).click();
  await page.getByRole('button', { name: 'Start your first experiment' }).click();
  await page.getByLabel(/Workflow/).selectOption('csv-summary');
  await page.getByLabel('CSV input version').selectOption({
    label: await page.getByLabel('CSV input version').locator('option').nth(1).textContent(),
  });
  await page.getByLabel('Numeric column name').fill('value');
  await page.getByRole('button', { name: 'Review configuration' }).click();
  await page.getByRole('button', { name: 'Submit experiment' }).click();
  const runDialog = page.getByRole('dialog');
  await expect(runDialog.getByText('Completed', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(runDialog).toContainText('2.5');
  const manifestDownload = page.waitForEvent('download');
  await runDialog.getByRole('link', { name: 'Export manifest' }).click();
  const manifest = JSON.parse(await readFile(await (await manifestDownload).path(), 'utf8'));
  expect(manifest.execution.input.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(manifest.execution.engineSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(manifest.artifacts).toHaveLength(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Handovers', exact: true }).click();
  await page.getByRole('button', { name: 'Create handover', exact: true }).click();
  await page.getByLabel('Handover title').fill('Browser reference');
  await page.getByRole('button', { name: 'Freeze reference' }).click();
  await expect(page.getByRole('dialog')).toContainText('Input bytes match the reference checksum.');
  await page.getByRole('button', { name: 'Verify handover', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('matched', { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await accessible(page);
  const reportDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download report' }).click();
  const report = JSON.parse(await readFile(await (await reportDownload).path(), 'utf8'));
  expect(report.checks[0].status).toBe('matched');
  expect(report.checks[0].independent).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Create handover', exact: true })).toBeFocused();
  // Browser reload must render authoritative persisted data, not an optimistic local-only result.
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Synthetic browser investigation', exact: true }),
  ).toBeVisible();
  await page.getByRole('heading', { name: 'Synthetic browser investigation', exact: true }).click();
  await page.getByRole('button', { name: 'Handovers', exact: true }).click();
  await expect(page.getByRole('button', { name: /Browser reference/ })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
