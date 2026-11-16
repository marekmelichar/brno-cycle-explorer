import { test, expect, type Page } from '@playwright/test';
import { collectConsoleErrors, waitForMapReady } from './helpers';

const LOCATION = { latitude: 49.1951, longitude: 16.6068 };

async function openStairs(page: Page) {
  await page.goto('/');
  await waitForMapReady(page);
  await page.getByTestId('tab-stairs').click();
  await page.evaluate(() => (window as any).__bceMap.jumpTo({ center: [16.6068, 49.1951], zoom: 15 }));
}

// Synthetic API answer (hand-made, not real OSM data): a big outdoor staircase with a known top,
// a small one, and an underpass staircase that the default filter hides.
const MOCK = {
  meta: { source: 'overpass', sourceUrl: 'https://overpass.test/api/interpreter', count: 3, lastRefreshed: '2026-11-16T10:00:00Z', osmTimestamp: '2026-11-16T09:00:00Z', lastError: null, refreshing: false },
  stairs: [
    {
      id: 'osm:101+102', osmIds: [101, 102], name: 'Testovací schody', lines: [[[16.605, 49.194], [16.6055, 49.1945]], [[16.6055, 49.1945], [16.606, 49.195]]],
      length: 130, stepCount: 64, stepCountPartial: false, drop: 10.2, top: [16.606, 49.195], bottom: [16.605, 49.194],
      surface: 'paving_stones', width: 2, handrail: true, lit: false, ramp: null, bicycle: null, sheltered: false, restricted: false,
    },
    {
      id: 'osm:201', osmIds: [201], name: null, lines: [[[16.6068, 49.1953], [16.6069, 49.1954]]],
      length: 12, stepCount: 8, stepCountPartial: false, drop: 1.3, top: null, bottom: null,
      surface: null, width: null, handrail: null, lit: null, ramp: null, bicycle: 'no', sheltered: false, restricted: false,
    },
    {
      id: 'osm:301', osmIds: [301], name: 'Podchod', lines: [[[16.61, 49.19], [16.6101, 49.1901]]],
      length: 20, stepCount: 30, stepCountPartial: false, drop: 4.8, top: null, bottom: null,
      surface: 'concrete', width: null, handrail: null, lit: null, ramp: null, bicycle: null, sheltered: true, restricted: false,
    },
  ],
};

test.describe('stairs finder', () => {
  test.use({ permissions: ['geolocation'], geolocation: LOCATION });

  test('real data: stairs are listed and drawn, a staircase can be selected (OSM or tile fallback)', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await openStairs(page);
    await expect(page.getByTestId('stair-item').first()).toBeVisible({ timeout: 60_000 });
    const source = await page.getByTestId('stairs-source').innerText();
    test.info().annotations.push({ type: 'stairs source', description: source.slice(0, 80) });
    expect(source).toMatch(/OpenStreetMap/);
    await page.getByTestId('stair-item').first().click();
    await expect(page.getByTestId('stair-detail')).toContainText('Délka');
    await page.waitForFunction(() => !(window as any).__bceMap.isMoving());
    const drawn = await page.evaluate(() => (window as any).__bceMap.queryRenderedFeatures({ layers: ['bce-stairs'] }).length);
    expect(drawn).toBeGreaterThan(0);
    // other tabs do not show the stairs layer
    await page.getByTestId('tab-map').click();
    await expect.poll(() => page.evaluate(() => (window as any).__bceMap.queryRenderedFeatures({ layers: ['bce-stairs'] }).length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('without OSM data the tiles fallback is used and labelled', async ({ page }) => {
    await page.route('**/api/stairs', (r) =>
      r.fulfill({ json: { meta: { ...MOCK.meta, source: 'none', count: 0, sourceUrl: null, lastRefreshed: null, osmTimestamp: null, lastError: { message: 'Služba Overpass není dostupná', at: '2026-11-16T10:00:00Z' } }, stairs: [] } }),
    );
    await openStairs(page);
    await expect(page.getByTestId('stairs-fallback')).toContainText('mapových dlaždic');
    await expect(page.getByTestId('stair-item').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Libovolný počet schodů')).toBeDisabled();
  });

  test('OSM data: filters, nearest sort, details and "plan route here" to the upper end', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.route('**/api/stairs', (r) => r.fulfill({ json: MOCK }));
    await openStairs(page);
    await expect(page.getByTestId('stairs-source')).toContainText('OpenStreetMap přes Overpass · 3 schodišť');
    // underpass hidden by default; biggest first
    await expect(page.getByTestId('stair-item')).toHaveCount(2);
    await expect(page.getByTestId('stair-item').first()).toContainText('Testovací schody · 64 schodů');
    await expect(page.getByTestId('stair-item').nth(1)).toContainText('8 schodů');
    await expect(page.getByTestId('stair-item').nth(1)).toContainText('zákaz kol');
    // minimum 10 steps → the small one goes
    await page.getByRole('slider').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('stair-item')).toHaveCount(1);
    await page.keyboard.press('Home');
    // nearest first from the device location (the small one is ~25 m away)
    await page.getByTestId('stairs-sort-distance').click();
    await expect(page.getByText('Vzdálenost od vaší polohy')).toBeVisible();
    await expect(page.getByTestId('stair-item').first()).toContainText('8 schodů');
    await expect(page.getByTestId('stair-item').first()).toContainText(/\d+ m/);
    // detail of the big one
    await page.getByTestId('stair-item').filter({ hasText: 'Testovací' }).click();
    const detail = page.getByTestId('stair-detail');
    await expect(detail).toContainText('≈ 10,2 m');
    await expect(detail).toContainText('dlažba');
    await expect(detail).toContainText('podle OSM (incline)');
    await expect(detail).toContainText('Ramena');
    await expect(detail.getByRole('link', { name: /OpenStreetMap/ })).toHaveAttribute('href', 'https://www.openstreetmap.org/way/101');
    // plan a route: destination = upper end, start = my location
    await detail.getByTestId('stair-plan').click();
    await expect(page.getByTestId('tab-planner')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('waypoint-list').locator('li')).toHaveCount(2);
    await expect(page.getByLabel('Název bodu 2')).toHaveValue('Testovací schody');
    const cfg = await page.evaluate(() => fetch('/api/config').then((r) => r.json()));
    if (cfg.routing.available) await expect(page.getByTestId('planner-status')).toContainText(/\d+,\d km|\d+ m/, { timeout: 90_000 });
    expect(errors).toEqual([]);
  });
});
