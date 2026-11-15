import { test, expect } from '@playwright/test';
import { collectConsoleErrors, waitForMapReady } from './helpers';

test('English UI: browser language picks English, texts and explanations are translated, switch works', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await waitForMapReady(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // tabs and layer list in English, incl. category names from the shared definitions
  await expect(page.getByTestId('tab-planner')).toContainText('Route planner');
  await expect(page.getByTestId('category-toggles')).toContainText('Separated cycle path');
  await expect(page.getByTestId('category-toggles')).toContainText('Pictogram corridor');
  await expect(page.getByTestId('feature-count')).toContainText(/\d{3}/);

  // GPX analysis: numbers use a decimal point, explanations are generated in English
  await page.getByTestId('tab-gpx').click();
  await page.getByTestId('gpx-input').setInputFiles('tests/fixtures/rullerovo-riviera.gpx');
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Loaded route' })).toBeVisible();
  await expect(page.getByTestId('route-total').first()).toHaveText(/^\d+\.\d km$/);
  await expect(page.getByTestId('group-table').first()).toContainText('Not verified / no matching record');
  await page.locator('[data-testid="analysis-panel"] tbody tr').first().click();
  await expect(page.getByTestId('section-detail')).toContainText('Why:');
  await expect(page.getByTestId('section-detail')).not.toContainText('Proč');

  // statistics tab
  await page.getByTestId('tab-stats').click();
  await expect(page.getByTestId('stats-panel')).toContainText('Deduplicated network');
  await page.screenshot({ path: 'tests/screenshots/desktop-english.png' });

  // switch to Czech and back
  await page.getByTestId('lang-toggle').click();
  await expect(page.getByTestId('tab-planner')).toContainText('Plánovač trasy');
  await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
  await page.getByTestId('lang-toggle').click();
  await expect(page.getByTestId('tab-planner')).toContainText('Route planner');

  // the choice is remembered
  await page.reload();
  await waitForMapReady(page);
  await expect(page.getByTestId('tab-planner')).toContainText('Route planner');
  expect(errors).toEqual([]);
});

test('English planner: engine and variant names are translated', async ({ page }) => {
  await page.goto('/');
  await waitForMapReady(page);
  const cfg = await page.evaluate(() => fetch('/api/config').then((r) => r.json()));
  test.skip(!cfg.routing.available || cfg.routing.defaultEngine !== 'brouter', 'BRouter not the default engine');
  await page.getByTestId('tab-planner').click();
  await expect(page.getByTestId('engine-select')).toContainText('BRouter (profiles for pleasant riding)');
  await page.getByTestId('load-example').click();
  await expect(page.getByTestId('candidates')).toContainText('BRouter:', { timeout: 90_000 });
  await expect(page.getByTestId('candidates')).not.toContainText('klidná');
  await expect(page.getByTestId('planner-status')).toContainText(/\d+\.\d km/);
});

test('search finds places outside the Czech Republic', async ({ page }) => {
  await page.goto('/');
  await waitForMapReady(page);
  const res = await page.evaluate(() => fetch('/api/geocode?q=Eiffel%20Tower%20Paris&lang=en').then((r) => r.json()));
  expect(res.results.length).toBeGreaterThan(0);
  expect(res.results[0].lat).toBeGreaterThan(48.8);
  expect(res.results[0].lat).toBeLessThan(48.9);
  expect(res.results[0].lon).toBeGreaterThan(2.2);
  expect(res.results[0].lon).toBeLessThan(2.4);
});
