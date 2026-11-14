import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { analysePixels, collectConsoleErrors, expectNoAccessBlocked, renderedCounts, trackRequests, waitForMapReady } from './helpers';

const GPX = 'tests/fixtures/rullerovo-riviera.gpx';

test.describe('Brno Cycle Explorer – desktop', () => {
  test('real basemap, official overlay, toggles, GPX import/analysis, export, no console errors', async ({ page }, info) => {
    const errors = collectConsoleErrors(page);
    const requests = trackRequests(page);
    await page.goto('/');

    // 1–4: map container has size and MapLibre initialises with the OpenFreeMap style
    const box = await page.getByTestId('map-container').boundingBox();
    expect(box!.width).toBeGreaterThan(600);
    expect(box!.height).toBeGreaterThan(400);
    await waitForMapReady(page);
    const style = await page.evaluate(() => (window as any).__bceMap.getStyle().sources.openmaptiles?.url ?? '');
    expect(style).toContain('openfreemap.org');

    // 5: basemap really renders streets, water, landuse and labels (vector features in the viewport)
    const counts = await renderedCounts(page);
    console.log('Rendered features:', JSON.stringify(counts));
    expect(counts['omt:transportation'] ?? 0, 'streets rendered').toBeGreaterThan(200);
    expect(counts['omt:water'] ?? 0, 'water (Svratka/Svitava) rendered').toBeGreaterThan(0);
    expect((counts['omt:place'] ?? 0) + (counts['omt:transportation_name'] ?? 0), 'labels rendered').toBeGreaterThan(5);
    const tileResponses = requests.filter((r) => r.url.includes('tiles.openfreemap.org') && /\/\d+\/\d+\/\d+\.pbf/.test(r.url));
    expect(tileResponses.length).toBeGreaterThan(3);
    expect(tileResponses.every((r) => r.status === 200 || r.status === 304)).toBe(true);

    // 6: no "Access blocked" placeholder tiles and no tile.openstreetmap.org usage
    await expectNoAccessBlocked(page, requests);

    // pixel-level check of the rendered map (not just "an image exists")
    const shot = await page.getByTestId('map-container').screenshot();
    const px = analysePixels(shot);
    console.log('Pixel analysis:', JSON.stringify(px));
    expect(px.uniqueColors, 'map has rich detail').toBeGreaterThan(150);
    expect(px.dominantShare, 'map is not a blank/uniform image').toBeLessThan(0.6);

    // 7: official infrastructure overlay is loaded
    await expect(page.getByTestId('feature-count')).toContainText(/\d{3}/);
    expect(counts['bce-infra'] ?? 0).toBeGreaterThan(100);

    // click a real infrastructure feature → original attributes shown
    const pt = await page.evaluate(() => {
      const m = (window as any).__bceMap;
      const f = m.queryRenderedFeatures({ layers: ['bce-infra-shared_path'] }).find((x: any) => x.geometry.type === 'LineString' && x.geometry.coordinates.length >= 2);
      const c = f.geometry.coordinates;
      const a = m.project(c[0]);
      const b = m.project(c[1]);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    });
    await page.getByTestId('map-container').click({ position: pt });
    await expect(page.getByTestId('feature-inspector')).toContainText('typ_opatreni');
    await expect(page.getByTestId('feature-inspector')).toContainText('datum_exportu');
    await page.getByLabel('Zavřít detail').click();

    // 8: toggle a category off and on
    const before = await page.evaluate(() => (window as any).__bceMap.queryRenderedFeatures({ layers: ['bce-infra-shared_path'] }).length);
    expect(before).toBeGreaterThan(0);
    await page.getByTestId('toggle-shared_path').click();
    await expect.poll(() => page.evaluate(() => (window as any).__bceMap.getLayoutProperty('bce-infra-shared_path', 'visibility'))).toBe('none');
    await expect.poll(() => page.evaluate(() => (window as any).__bceMap.queryRenderedFeatures({ layers: ['bce-infra-shared_path'] }).length)).toBe(0);
    const zoomBefore = await page.evaluate(() => (window as any).__bceMap.getZoom());
    await page.getByTestId('toggle-shared_path').click();
    await expect.poll(() => page.evaluate(() => (window as any).__bceMap.getLayoutProperty('bce-infra-shared_path', 'visibility'))).toBe('visible');
    expect(await page.evaluate(() => (window as any).__bceMap.getZoom())).toBe(zoomBefore); // map state preserved

    // 9–10: import GPX and verify statistics are calculated
    await page.getByTestId('tab-gpx').click();
    await page.getByTestId('gpx-input').setInputFiles(GPX);
    await expect(page.getByTestId('gpx-name')).toHaveText('Rullerovo nábřeží – Riviéra');
    const stats = page.getByTestId('route-stats').first();
    await expect(stats).toBeVisible();
    await expect(page.getByTestId('route-total').first()).toHaveText(/^\d+,\d km$/);
    await expect(page.getByTestId('reconciliation').first()).toContainText('rozdíl 0.000 m');
    const groupText = await page.getByTestId('group-table').first().innerText();
    console.log('GPX analysis:\n' + groupText);
    expect(groupText).toMatch(/Oddělené cyklostezky/);
    await expect(page.getByTestId('analysis-panel')).toBeVisible();
    await page.waitForTimeout(1200);
    const routeRendered = await page.evaluate(() => (window as any).__bceMap.queryRenderedFeatures({ layers: ['bce-route-matched', 'bce-route-unmatched'] }).length);
    expect(routeRendered).toBeGreaterThan(0);

    // click a section in the table → explanation shown
    await page.locator('[data-testid="analysis-panel"] tbody tr').first().click();
    await expect(page.getByTestId('section-detail')).toContainText('Proč:');
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'tests/screenshots/desktop-gpx-analysis.png' });

    // street names stay readable: every overlay sits below the basemap's first label layer
    const order = await page.evaluate(() => {
      const layers = (window as any).__bceMap.getStyle().layers as Array<{ id: string; type: string }>;
      const firstLabel = layers.findIndex((l) => l.type === 'symbol');
      const lastOverlay = Math.max(...layers.map((l, i) => (l.id.startsWith('bce-') ? i : -1)));
      return { firstLabel, lastOverlay };
    });
    expect(order.firstLabel).toBeGreaterThan(0);
    expect(order.lastOverlay).toBeLessThan(order.firstLabel);

    // transparency slider: user-set opacity applies to route and infrastructure lines
    const routeOpacity = () => page.evaluate(() => (window as any).__bceMap.getPaintProperty('bce-route-matched', 'line-opacity'));
    await page.getByTestId('see-through-button').click();
    const slider = page.getByTestId('opacity-panel').getByRole('slider');
    await slider.focus();
    await page.keyboard.press('Home');
    await expect.poll(routeOpacity).toBeCloseTo(0.15, 5);
    expect(await page.evaluate(() => (window as any).__bceMap.getPaintProperty('bce-infra-shared_path', 'line-opacity'))).toBeLessThan(0.2);
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    await expect.poll(routeOpacity).toBeCloseTo(0.45, 5);
    await expect(page.getByTestId('opacity-panel')).toContainText('45 %');
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'tests/screenshots/desktop-see-through.png' });
    await page.keyboard.press('End');
    await expect.poll(routeOpacity).toBe(1);
    await page.getByTestId('see-through-button').click();
    await expect(page.getByTestId('opacity-panel')).toBeHidden();

    // 11: export GPX and validate XML
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-gpx').click()]);
    const xml = readFileSync((await download.path())!, 'utf8');
    const errorsXml: string[] = [];
    const doc = new DOMParser({ onError: (_l: string, m: string) => errorsXml.push(m) } as any).parseFromString(xml, 'application/xml');
    expect(errorsXml).toEqual([]);
    expect(doc.documentElement.nodeName).toBe('gpx');
    expect(doc.documentElement.getAttribute('version')).toBe('1.1');
    expect(doc.documentElement.getAttribute('xmlns')).toBe('http://www.topografix.com/GPX/1/1');
    const pts = doc.getElementsByTagName('trkpt');
    expect(pts.length).toBeGreaterThan(100);
    for (let i = 0; i < pts.length; i++) {
      const lat = Number(pts[i].getAttribute('lat'));
      const lon = Number(pts[i].getAttribute('lon'));
      expect(lat).toBeGreaterThan(49);
      expect(lon).toBeGreaterThan(16);
    }
    info.attach('exported.gpx', { body: xml, contentType: 'application/gpx+xml' });

    // overview screenshot
    await page.getByTestId('tab-map').click();
    await page.getByLabel('Zavřít detail úseku').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/desktop-overview.png' });

    // 12: no JavaScript errors in the console
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('switching basemap preserves overlays and view', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await waitForMapReady(page);
    const center = await page.evaluate(() => (window as any).__bceMap.getCenter().toArray());
    await page.getByTestId('basemap-select').click();
    await page.getByRole('option', { name: /Tmavá/ }).click();
    await expect(page.getByTestId('map-container')).toHaveAttribute('data-basemap', 'ofm-dark');
    await waitForMapReady(page);
    const counts = await renderedCounts(page);
    expect(counts['omt:transportation'] ?? 0).toBeGreaterThan(100);
    expect(counts['bce-infra'] ?? 0).toBeGreaterThan(100);
    expect(await page.evaluate(() => (window as any).__bceMap.getCenter().toArray())).toEqual(center);
    await page.screenshot({ path: 'tests/screenshots/desktop-dark.png' });
    // restore default for later tests (persisted in localStorage)
    await page.getByTestId('basemap-select').click();
    await page.getByRole('option', { name: /Liberty/ }).click();
    expect(errors).toEqual([]);
  });

  test('blocked basemap provider shows a visible error with retry (never a silent blank map)', async ({ page }) => {
    await page.route('**/tiles.openfreemap.org/styles/**', (r) => r.abort('blockedbyclient'));
    await page.goto('/');
    await expect(page.getByTestId('basemap-error')).toBeVisible();
    await expect(page.getByTestId('basemap-error')).toContainText('Mapový podklad se nepodařilo načíst');
    await page.unroute('**/tiles.openfreemap.org/styles/**');
    await page.getByRole('button', { name: 'Zkusit znovu' }).click();
    await expect(page.getByTestId('basemap-error')).toBeHidden();
    await waitForMapReady(page);
    expect((await renderedCounts(page))['omt:transportation'] ?? 0).toBeGreaterThan(100);
  });

  test('example route: waypoints are geocoded positions; routing engine (BRouter by default) follows real roads', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/');
    await waitForMapReady(page);
    await page.getByTestId('tab-planner').click();
    const cfg = await page.evaluate(() => fetch('/api/config').then((r) => r.json()));
    await page.getByTestId('load-example').click();
    await expect(page.getByTestId('waypoint-list').locator('li')).toHaveCount(7);
    if (!cfg.routing.available) {
      test.info().annotations.push({ type: 'limitation', description: 'Routing provider not configured' });
      return;
    }
    const res = await Promise.race([
      page.getByTestId('candidates').waitFor({ timeout: 90_000 }).then(() => 'ok'),
      page.getByTestId('notification').filter({ hasText: /Směrovací server|nedostupn/ }).waitFor({ timeout: 90_000 }).then(() => 'error'),
    ]);
    if (res === 'error') {
      test.info().annotations.push({ type: 'limitation', description: 'Public Valhalla routing server unavailable during test' });
      test.skip(true, 'Valhalla routing server unavailable');
    }
    const cand = page.getByTestId('candidates');
    await expect(cand).toContainText('Varianta 1');
    // the calculated route is much longer than the straight-line polygon of the waypoints and has many vertices
    const geom = await page.evaluate(() => {
      const m = (window as any).__bceMap;
      const src = m.getSource('bce-route');
      return (src._data?.features ?? src.serialize().data.features).reduce((s: number, f: any) => s + f.geometry.coordinates.length, 0);
    });
    expect(geom).toBeGreaterThan(200);
    await expect(page.getByTestId('route-stats')).toBeVisible();
    await page.waitForTimeout(1200);
    // default engine BRouter: unverified sections are described with OSM data, clearly labelled
    if (cfg.routing.defaultEngine === 'brouter') {
      await expect(page.getByTestId('osm-breakdown')).toContainText('podle OpenStreetMap');
      const osmRow = page.locator('[data-testid="analysis-panel"] tbody tr', { hasText: 'OSM:' }).first();
      await expect(osmRow).toBeVisible();
      await osmRow.click();
      await expect(page.getByTestId('section-osm')).toContainText('highway=');
      await expect(page.getByTestId('section-osm')).toContainText('Nejde o oficiální záznam');
      await page.getByLabel('Zavřít detail úseku').click();
    }
    await page.screenshot({ path: 'tests/screenshots/desktop-example-route.png' });
    // planned route export
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('planner-export').click()]);
    const xml = readFileSync((await download.path())!, 'utf8');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.getElementsByTagName('wpt').length).toBe(7);
    expect(doc.getElementsByTagName('trkpt').length).toBeGreaterThan(200);
    expect(errors).toEqual([]);
  });
});
