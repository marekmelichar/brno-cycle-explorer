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
  // the layer list explains route colours, incl. the white dashes for unmatched sections
  await page.getByRole('button', { name: 'Rozbalit panel', exact: true }).click();
  await expect(page.getByTestId('route-colour-note')).toContainText('Neověřeno');
  await page.getByTestId('tab-gpx').click();
  await page.getByTestId('gpx-input').setInputFiles('tests/fixtures/rullerovo-riviera.gpx');
  // Sonner toast confirms the import, below the top bar (not covering it)
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Načtena trasa' });
  await expect(toast).toBeVisible();
  expect((await toast.boundingBox())!.y).toBeGreaterThanOrEqual(52);
  await page.screenshot({ path: 'tests/screenshots/mobile-toast.png' });
  await page.getByRole('button', { name: 'Rozbalit panel', exact: true }).click({ timeout: 10_000 });
  await expect(page.getByTestId('route-total').first()).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tests/screenshots/mobile-gpx.png' });

  // phone section list: compact rows (not the desktop table), tap opens the explanation inline
  const list = page.getByTestId('section-list');
  await expect(list).toBeVisible();
  await expect(page.locator('[data-testid="analysis-panel"] table')).toHaveCount(0);
  await list.getByRole('button').first().click();
  await expect(page.getByTestId('section-detail')).toContainText('Proč:');

  // the section list belongs to Plánovač/GPX only, not Statistiky
  await page.getByTestId('tab-stats').click();
  await expect(page.getByTestId('analysis-panel')).toHaveCount(0);

  // collapsed sheet shows a one-line route summary; tapping it opens the sheet
  await page.getByRole('button', { name: 'Sbalit panel', exact: true }).click();
  const summary = page.getByTestId('peek-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(/\d+,\d km/);
  await page.screenshot({ path: 'tests/screenshots/mobile-peek-summary.png' });
  await summary.click();
  await expect(page.getByRole('button', { name: 'Rozbalit panel', exact: true })).toBeVisible();

  // place search on the phone
  await page.getByTestId('mobile-search-button').click();
  await expect(page.getByTestId('mobile-search').getByRole('combobox')).toBeFocused();
  await page.getByLabel('Zavřít hledání').click();
  await expect(page.getByTestId('mobile-search')).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('mobile planner: two taps on the map calculate the route automatically', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await waitForMapReady(page);
  const cfg = await page.evaluate(() => fetch('/api/config').then((r) => r.json()));
  test.skip(!cfg.routing.available, 'routing not configured');
  await page.getByTestId('tab-planner').click();
  await expect(page.getByTestId('planner-hint')).toBeVisible();
  const box = (await page.getByTestId('map-container').boundingBox())!;
  // two points in central Brno, well inside the visible map above the collapsed sheet
  const a = await page.evaluate(() => (window as any).__bceMap.project([16.6, 49.195]));
  const b = await page.evaluate(() => (window as any).__bceMap.project([16.612, 49.2]));
  await page.mouse.click(box.x + a.x, box.y + a.y);
  await expect(page.getByTestId('planner-hint')).toHaveCount(0); // hint disappears after the first point
  await page.mouse.click(box.x + b.x, box.y + b.y);
  // no button press: the route is calculated automatically; the fixed action bar shows it
  await expect(page.getByTestId('planner-status')).toContainText(/\d+,\d km/, { timeout: 90_000 });
  await expect(page.getByTestId('planner-actions')).toBeInViewport();
  // points get a street name instead of "Bod 1" (Nominatim reverse, only on user action)
  await expect(page.getByLabel('Název bodu 1')).not.toHaveValue('Bod 1', { timeout: 20_000 });
  await page.screenshot({ path: 'tests/screenshots/mobile-auto-route.png' });
  // collapsed sheet: one-line summary of the new route
  await page.getByRole('button', { name: 'Sbalit panel', exact: true }).click(); // one tap from half-open
  await expect(page.getByTestId('peek-summary')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile: a dropped connection while routing shows a retry, and recovers', async ({ page }) => {
  await page.goto('/');
  await waitForMapReady(page);
  const cfg = await page.evaluate(() => fetch('/api/config').then((r) => r.json()));
  test.skip(!cfg.routing.available, 'routing not configured');
  // the first route request dies mid-flight (as when iOS suspends the browser)
  let failed = false;
  await page.route('**/api/route', async (route) => {
    if (!failed) {
      failed = true;
      await route.abort('connectionreset');
    } else await route.continue();
  });
  await page.getByTestId('tab-planner').click();
  const box = (await page.getByTestId('map-container').boundingBox())!;
  const a = await page.evaluate(() => (window as any).__bceMap.project([16.6, 49.195]));
  const b = await page.evaluate(() => (window as any).__bceMap.project([16.612, 49.2]));
  await page.mouse.click(box.x + a.x, box.y + a.y);
  await page.mouse.click(box.x + b.x, box.y + b.y);
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Spojení se přerušilo' });
  await expect(toast).toBeVisible({ timeout: 30_000 });
  await toast.getByRole('button', { name: 'Zkusit znovu' }).click();
  await expect(page.getByTestId('planner-status')).toContainText(/\d+,\d km/, { timeout: 90_000 });
});
