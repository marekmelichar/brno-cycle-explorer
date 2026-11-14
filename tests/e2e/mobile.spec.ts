import { test, expect } from '@playwright/test';
import { analysePixels, collectConsoleErrors, renderedCounts, waitForMapReady } from './helpers';

test('mobile layout: full-screen map with bottom sheet', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await waitForMapReady(page);
  const box = await page.getByTestId('map-container').boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.width).toBe(vp.width);
  expect(box!.height).toBeGreaterThan(vp.height * 0.8);
  const counts = await renderedCounts(page);
  expect(counts['omt:transportation'] ?? 0).toBeGreaterThan(100);
  expect(counts['bce-infra'] ?? 0).toBeGreaterThan(50);
  const px = analysePixels(await page.getByTestId('map-container').screenshot());
  expect(px.uniqueColors).toBeGreaterThan(100);
  await expect(page.getByTestId('bottom-sheet')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/mobile-map.png' });
  await page.getByTestId('tab-gpx').click();
  await page.getByTestId('gpx-input').setInputFiles('tests/fixtures/rullerovo-riviera.gpx');
  await page.getByRole('button', { name: 'Rozbalit panel', exact: true }).click({ timeout: 10_000 });
  await expect(page.getByTestId('route-total').first()).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tests/screenshots/mobile-gpx.png' });
  // legend is reachable on phones: button under the map controls opens an overlay
  await page.getByRole('button', { name: 'Sbalit panel', exact: true }).click();
  await page.getByTestId('legend-button').click();
  const legend = page.getByTestId('map-legend-mobile');
  await expect(legend).toBeVisible();
  await expect(legend).toContainText('Piktogramový koridor');
  await expect(legend).toContainText('Neověřeno');
  await page.screenshot({ path: 'tests/screenshots/mobile-legend.png' });
  await page.getByLabel('Zavřít legendu').click();
  await expect(legend).toBeHidden();
  await expect(page.getByTestId('legend-button')).toBeVisible();
  expect(errors).toEqual([]);
});
